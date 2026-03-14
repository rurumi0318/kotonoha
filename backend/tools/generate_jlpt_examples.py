"""
Generate example sentences for JLPT words using the Gemini API.

Reads:  backend/data/jlpt/term_meta_bank_{1..5}_enriched.json
Writes: backend/data/jlpt/term_meta_bank_{n}_examples.json
        backend/data/jlpt/term_meta_bank_{n}_examples_progress.json  (resume state)

Requirements:
    pip install google-genai
    export GEMINI_API_KEY=your_key_here

Usage:
    python tools/generate_jlpt_examples.py [--batch-size N] [--rpm N] [--file N]

Options:
    --batch-size N   Words per API call (default: 100)
    --rpm N          API calls per minute (default: 1)
    --file N         Process only file N (1-5); omit to process all
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

JLPT_DIR = Path(__file__).parent.parent / "data" / "jlpt"

JLPT_LEVEL = {1: "N1", 2: "N2", 3: "N3", 4: "N4", 5: "N5"}

PROMPT_TEMPLATE = """\
You are a Japanese language teacher. For each word in the JSON array below, \
provide one natural, common example sentence in Japanese and its English translation.

Rules:
- The example sentence must naturally use the word with the given reading and meaning.
- Match the sentence complexity to the word's JLPT level: N5/N4 sentences should be \
short and simple (beginner-friendly vocabulary and grammar); N3 sentences moderately \
complex; N2/N1 sentences can use advanced vocabulary and grammar structures.
- Respond ONLY with a valid JSON array. No markdown, no explanation.
- Each object in the response must include the original "idseq" and "word_key" fields unchanged.

Input:
{input_json}

Response format (JSON array):
[
  {{"idseq": <number or null>, "word_key": "<word>:<reading>", "example_jp": "<sentence>", "example_en": "<translation>"}},
  ...
]
"""


def make_word_key(entry: dict) -> str:
    return f"{entry['word']}:{entry['reading']}"


def build_prompt(batch: list[dict], jlpt_level: str) -> str:
    input_items = [
        {
            "idseq": e["idseq"],
            "word_key": make_word_key(e),
            "word": e["word"],
            "reading": e["reading"],
            "pos": e["pos"],
            "definition": e["definition"],
            "jlpt": jlpt_level,
        }
        for e in batch
    ]
    return PROMPT_TEMPLATE.format(input_json=json.dumps(input_items, ensure_ascii=False, indent=2))


def parse_response(text: str) -> list[dict] | None:
    """Extract and parse the JSON array from the model response."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    return None


def map_results(batch: list[dict], raw_results: list[dict]) -> list[dict]:
    """
    Map AI results back to original entries using idseq (primary) or
    word_key (fallback for null-idseq entries).
    """
    # Build lookup from AI response
    by_idseq: dict[int, dict] = {}
    by_word_key: dict[str, dict] = {}
    for r in raw_results:
        if r.get("idseq") is not None:
            by_idseq[r["idseq"]] = r
        if r.get("word_key"):
            by_word_key[r["word_key"]] = r

    mapped = []
    for entry in batch:
        result = None
        if entry["idseq"] is not None:
            result = by_idseq.get(entry["idseq"])
        if result is None:
            result = by_word_key.get(make_word_key(entry))

        mapped.append({
            "idseq": entry["idseq"],
            "word": entry["word"],
            "reading": entry["reading"],
            "example_jp": result.get("example_jp", "") if result else "",
            "example_en": result.get("example_en", "") if result else "",
        })
    return mapped


def load_progress(progress_path: Path) -> dict:
    if progress_path.exists():
        return json.loads(progress_path.read_text(encoding="utf-8"))
    return {"completed_batches": {}, "results": []}


def save_progress(progress_path: Path, progress: dict) -> None:
    progress_path.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")


def process_file(client: genai.Client, file_n: int, batch_size: int, rpm: int) -> None:
    src = JLPT_DIR / f"term_meta_bank_{file_n}_enriched.json"
    dst = JLPT_DIR / f"term_meta_bank_{file_n}_examples.json"
    progress_path = JLPT_DIR / f"term_meta_bank_{file_n}_examples_progress.json"
    jlpt_level = JLPT_LEVEL[file_n]

    if not src.exists():
        print(f"Skipping {src.name} (not found)")
        return

    entries = json.loads(src.read_text(encoding="utf-8"))
    total = len(entries)
    batches = [entries[i:i + batch_size] for i in range(0, total, batch_size)]
    num_batches = len(batches)

    progress = load_progress(progress_path)
    completed = progress["completed_batches"]  # {str(batch_idx): True}
    results: list[dict] = progress["results"]

    print(f"\nProcessing {src.name} ({total} words, {num_batches} batches, JLPT {jlpt_level})")

    sleep_secs = 60.0 / rpm
    first_call = True

    for bi, batch in enumerate(batches):
        batch_key = str(bi)
        if batch_key in completed:
            print(f"  Batch {bi + 1}/{num_batches}: already done, skipping")
            continue

        if not first_call:
            print(f"  Waiting {sleep_secs:.0f}s (rate limit)…")
            time.sleep(sleep_secs)
        first_call = False

        print(f"  Batch {bi + 1}/{num_batches}: {len(batch)} words…", end=" ", flush=True)

        prompt = build_prompt(batch, jlpt_level)
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.3),
            )
            raw_text = response.text
        except Exception as e:
            print(f"ERROR: {e}")
            print("Saving progress and stopping.")
            save_progress(progress_path, progress)
            sys.exit(1)

        parsed = parse_response(raw_text)
        if parsed is None:
            print("PARSE ERROR — raw response saved to progress, skipping batch")
            print(f"    Raw: {raw_text[:200]}")
            # Mark as completed with empty results so we don't get stuck
            batch_results = [
                {"idseq": e["idseq"], "word": e["word"], "reading": e["reading"],
                 "example_jp": "", "example_en": ""}
                for e in batch
            ]
        else:
            batch_results = map_results(batch, parsed)

        results.extend(batch_results)
        completed[batch_key] = True
        save_progress(progress_path, {"completed_batches": completed, "results": results})
        print(f"done ({len(batch_results)} mapped)")

    # All batches complete — write final output and clean up progress
    dst.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    progress_path.unlink(missing_ok=True)
    print(f"  -> {dst.name} ({len(results)} entries)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate JLPT example sentences via Gemini API")
    parser.add_argument("--batch-size", type=int, default=100, metavar="N",
                        help="Words per API call (default: 100)")
    parser.add_argument("--rpm", type=int, default=1, metavar="N",
                        help="API calls per minute (default: 1)")
    parser.add_argument("--file", type=int, choices=range(1, 6), metavar="N",
                        help="Process only file N (1-5); omit to process all")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
        print("  export GEMINI_API_KEY=your_key_here", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(api_key=api_key)

    files_to_process = [args.file] if args.file else list(range(1, 6))
    for n in files_to_process:
        process_file(client, n, args.batch_size, args.rpm)

    print("\nDone.")


if __name__ == "__main__":
    main()
