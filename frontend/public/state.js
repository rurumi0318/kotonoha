export const state = {
  user: null,
  preferences: null,
  // Navigation context for breadcrumbs (set by views on load)
  collectionName: null,
  deckName: null,
  // Words list cache keyed by "cid/did" to avoid re-fetching on word-to-word navigation
  wordsCache: {},
};
