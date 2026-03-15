import os

from google.cloud import storage


class AudioCache:
    def __init__(self) -> None:
        self._client = storage.Client()
        self._bucket_name = os.environ.get('TTS_BUCKET_NAME', 'kotonoha-tts')

    def _blob(self, key: str):
        return self._client.bucket(self._bucket_name).blob(f'tts/{key}.mp3')

    def get_bytes(self, key: str) -> bytes | None:
        blob = self._blob(key)
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    def put(self, key: str, audio_bytes: bytes) -> None:
        blob = self._blob(key)
        blob.upload_from_string(audio_bytes, content_type='audio/mpeg')
        blob.cache_control = 'public, max-age=86400'
        blob.patch()


_cache: AudioCache | None = None


def get_audio_cache() -> AudioCache:
    global _cache
    if _cache is None:
        _cache = AudioCache()
    return _cache
