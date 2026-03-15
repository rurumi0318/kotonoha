import hashlib
import os
import unicodedata
from abc import ABC, abstractmethod

from google.cloud import texttospeech


def normalize_text(text: str) -> str:
    """NFKC normalize, strip, and collapse whitespace."""
    return ' '.join(unicodedata.normalize('NFKC', text).split())


def cache_key(voice_name: str, text: str) -> str:
    """SHA-256 hex digest of voice_name + normalized text."""
    payload = (voice_name + normalize_text(text)).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


class TTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str) -> bytes:
        """Return MP3 audio bytes for the given text."""
        ...


class GoogleCloudTTSProvider(TTSProvider):
    def __init__(self) -> None:
        self._client = texttospeech.TextToSpeechClient()
        self._voice_name = os.environ.get('TTS_VOICE_NAME', 'ja-JP-Chirp3-HD-Leda')
        self._language_code = os.environ.get('TTS_LANGUAGE_CODE', 'ja-JP')

    def synthesize(self, text: str, voice_name: str | None = None) -> bytes:
        normalized = normalize_text(text)
        name = voice_name or self._voice_name
        response = self._client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=normalized),
            voice=texttospeech.VoiceSelectionParams(
                language_code=self._language_code,
                name=name,
            ),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
            ),
        )
        return response.audio_content


_provider: TTSProvider | None = None


def get_tts_provider() -> TTSProvider:
    global _provider
    if _provider is None:
        _provider = GoogleCloudTTSProvider()
    return _provider
