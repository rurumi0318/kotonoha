export const state = {
  user: null,
  preferences: null,
  // Navigation context for breadcrumbs (set by views on load)
  collectionName: null,
  deckName: null,
  // Data caches — keyed collections/decks avoid redundant network round-trips on back-navigation
  collectionsCache: null,   // Collection[] | null
  decksCache: {},           // { [cid]: Deck[] }
  wordsCache: {},           // { ["cid/did"]: Word[] }
};
