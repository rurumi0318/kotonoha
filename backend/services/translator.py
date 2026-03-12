"""
Placeholder translator service.

Replace translate_batch() with a real API call (e.g. DeepL, Google Translate)
when ready. The interface is intentionally minimal: a list of strings in, a
list of strings out (same length, same order).
"""


class TranslatorService:
    async def translate_batch(self, texts: list[str]) -> list[str]:
        """
        Translate a batch of texts.
        Placeholder: returns texts unchanged.
        """
        return texts


_translator: TranslatorService | None = None


def get_translator() -> TranslatorService:
    global _translator
    if _translator is None:
        _translator = TranslatorService()
    return _translator
