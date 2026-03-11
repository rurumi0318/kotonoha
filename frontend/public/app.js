import { onAuthChange, handleRedirectResult } from './auth.js';
import { state } from './state.js';
import { navigate } from './utils.js';

import renderLogin       from './views/login.js';
import renderCollections from './views/collections.js';
import renderDecks       from './views/decks.js';
import renderWords       from './views/words.js';
import renderWord        from './views/word.js';
import renderTest        from './views/test.js';
import renderSettings    from './views/settings.js';

const app = document.getElementById('app');

async function route() {
  const hash  = window.location.hash || '#/';
  const path  = hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter(Boolean);
  const view  = parts[0] || 'collections';

  // Auth guard
  if (!state.user && view !== 'login') {
    navigate('#/login');
    return;
  }
  if (state.user && view === 'login') {
    navigate('#/collections');
    return;
  }

  try {
    switch (view) {
      case 'login':        await renderLogin(app);                              break;
      case 'collections':  await renderCollections(app);                        break;
      case 'decks':        await renderDecks(app, parts[1]);                    break;
      case 'words':        await renderWords(app, parts[1], parts[2]);          break;
      case 'word':         await renderWord(app, parts[1], parts[2], parts[3]); break;
      case 'test':         await renderTest(app, parts[1], parts[2]);           break;
      case 'settings':     await renderSettings(app);                           break;
      default:             await renderCollections(app);                        break;
    }
  } catch (err) {
    console.error('Route error:', err);
  }
}

window.addEventListener('hashchange', route);

// Process any pending redirect sign-in before listening for auth state.
// Without this, onAuthStateChanged fires with null before the redirect
// result is consumed, sending the user back to the login page.
handleRedirectResult().finally(() => {
  onAuthChange((user) => {
    state.user = user;
    route();
  });
});
