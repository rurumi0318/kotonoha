"""
Pre-generate TTS audio for all JLPT quickadd vocabulary and upload to GCS.

Uses the same cache key formula as the live backend (sha256(voice + normalizedText)),
so pre-generated files are served transparently from cache on first user request.

Usage:
  python tools/pregenerate_tts.py
  python tools/pregenerate_tts.py --voices ja-JP-Chirp3-HD-Leda,ja-JP-Chirp3-HD-Aoede
  python tools/pregenerate_tts.py --content words
  python tools/pregenerate_tts.py --dry-run

Environment variables:
  TTS_VOICE_NAME   Default voice (fallback when --voices not given)
  TTS_BUCKET_NAME  GCS bucket name (default: kotonoha-tts)
"""

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

# Allow imports from parent package
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.tts_service import GoogleCloudTTSProvider, cache_key, normalize_text
from services.audio_cache import AudioCache


_DB_PATH = Path(__file__).parent.parent / "data" / "quickadd.db"


def load_texts(content: str) -> list[str]:
    """Load unique word surfaces and/or example sentences from quickadd.db."""
    if not _DB_PATH.exists():
        sys.exit(f"quickadd.db not found at {_DB_PATH}. Run build_quickadd_db.py first.")

    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    texts = set()

    if content in ('words', 'all'):
        for row in conn.execute("SELECT DISTINCT word FROM quickadd_words"):
            t = normalize_text(row['word'])
            if t:
                texts.add(t)

    if content in ('sentences', 'all'):
        for row in conn.execute("SELECT DISTINCT example_jp FROM quickadd_words WHERE example_jp IS NOT NULL"):
            t = normalize_text(row['example_jp'])
            if t:
                texts.add(t)

    conn.close()
    return sorted(texts)


def run(voices: list[str], content: str, dry_run: bool) -> None:
    texts = load_texts(content)
    print(f"Loaded {len(texts)} unique text strings ({content})")

    cache   = AudioCache()
    provider = GoogleCloudTTSProvider() if not dry_run else None

    total_new   = 0
    total_skip  = 0
    total_chars = 0

    for voice in voices:
        print(f"\n── Voice: {voice} ──")
        new = skip = chars = 0

        for i, text in enumerate(texts, 1):
            key = cache_key(voice, text)
            exists = cache._blob(key).exists()

            status = 'SKIP' if exists else ('DRY' if dry_run else 'GEN')
            if (i % 100 == 0) or not exists:
                print(f"  [{i:4d}/{len(texts)}] {status}  {text[:50]}")

            if exists:
                skip += 1
                continue

            chars += len(text)
            if not dry_run:
                # Override voice for this synthesis call
                os.environ['TTS_VOICE_NAME'] = voice
                audio_bytes = provider.synthesize(text)
                cache.put(key, audio_bytes)
            new += 1

        cost = chars * 30 / 1_000_000  # Chirp 3: HD = $30/1M chars
        print(f"  Done — new: {new}, skipped: {skip}, chars: {chars}, est. cost: ${cost:.4f}")
        total_new   += new
        total_skip  += skip
        total_chars += chars

    total_cost = total_chars * 30 / 1_000_000
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Total — new: {total_new}, skipped: {total_skip}, "
          f"chars: {total_chars}, est. cost: ${total_cost:.4f}")


def main() -> None:
    parser = argparse.ArgumentParser(description='Pre-generate TTS audio for JLPT quickadd vocabulary')
    parser.add_argument(
        '--voices',
        default=os.environ.get('TTS_VOICE_NAME', 'ja-JP-Chirp3-HD-Leda'),
        help='Comma-separated voice names (default: TTS_VOICE_NAME env var)',
    )
    parser.add_argument(
        '--content',
        choices=['words', 'sentences', 'all'],
        default='all',
        help='What to generate: words, sentences, or all (default: all)',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Check what would be generated without calling the TTS API',
    )
    args = parser.parse_args()

    voices = [v.strip() for v in args.voices.split(',') if v.strip()]
    run(voices=voices, content=args.content, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
