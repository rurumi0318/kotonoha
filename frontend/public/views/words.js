import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/+esm';
import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText } from '../furigana.js';
import {
  navigate, showToast, showModal, closeModal, escapeHtml,
  fsrsStateBadge, formatDate,
} from '../utils.js';

export default async function renderWords(app, cid, did) {
  if (!cid || !did) { navigate('#/collections'); return; }

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Decks
        </button>
        <div class="header-title" id="deck-title"></div>
        <button class="btn-icon" id="test-btn" title="Test this deck">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
      </header>
      <main class="app-main">
        <div class="breadcrumb" id="breadcrumb"></div>
        <div class="page-header">
          <div>
            <h1 class="page-title">Words</h1>
            <div class="page-meta" id="word-count"></div>
          </div>
          <button class="btn-primary" id="new-btn">+ Add Word</button>
        </div>
        <div id="list" class="card-list">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate(`#/decks/${cid}`);
  document.getElementById('test-btn').onclick = () => navigate(`#/test/${cid}/${did}`);
  document.getElementById('new-btn').onclick = () => openWordModal(null);

  let words = [];

  try {
    // Load deck info and words in parallel
    const [decks, fetchedWords] = await Promise.all([
      api.get(`/collections/${cid}/decks`),
      api.get(`/collections/${cid}/decks/${did}/words`),
    ]);
    const deck = decks.find(d => d.id === did);
    const deckName = deck?.name || '';
    state.deckName = deckName;
    document.getElementById('deck-title').textContent = deckName;

    const colName = state.collectionName || '';
    if (colName) {
      document.getElementById('breadcrumb').textContent = `${colName} › ${deckName}`;
    }

    words = fetchedWords;
    renderList(words);
  } catch (err) {
    document.getElementById('list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Failed to load words</div>
      </div>`;
    showToast('Failed to load words', 'error');
  }

  function renderList(ws) {
    const list = document.getElementById('list');
    const countEl = document.getElementById('word-count');
    if (countEl) countEl.textContent = `${ws.length} word${ws.length !== 1 ? 's' : ''}`;

    if (!ws.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-title">No words yet</div>
          <div class="empty-state-desc">Add your first word to this deck.</div>
        </div>`;
      return;
    }

    list.innerHTML = ws.map(w => {
      const surface = renderFuriganaText(w.word);
      const furigana = renderFurigana(w.word);
      const due = w.fsrs_data?.due_date;
      const dueStr = formatDate(due);
      const isOverdue = due && new Date(due) <= new Date();
      return `
        <div class="word-item" data-id="${w.id}">
          <span class="card-drag" title="Drag to reorder">⠿</span>
          <div class="word-item-body" data-id="${w.id}">
            <span class="word-surface-sm" lang="ja">${furigana}</span>
            <div class="word-item-right">
              ${fsrsStateBadge(w.fsrs_data?.state)}
              <span class="due-label ${isOverdue ? 'overdue' : ''}">${escapeHtml(dueStr)}</span>
              ${w.is_paused ? '<span class="badge badge-tag">Paused</span>' : ''}
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-icon delete-btn" data-id="${w.id}" data-surface="${escapeHtml(surface)}" title="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.word-item-body').forEach(el => {
      el.onclick = () => navigate(`#/word/${cid}/${did}/${el.dataset.id}`);
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const word = words.find(w => w.id === btn.dataset.id);
        if (word) openDeleteModal(word);
      };
    });

    Sortable.create(list, {
      handle: '.card-drag',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async () => {
        const newOrder = [...list.querySelectorAll('.word-item')].map(el => el.dataset.id);
        words = newOrder.map(id => words.find(w => w.id === id)).filter(Boolean);
        try {
          await api.put(`/collections/${cid}/decks/${did}/words/order`, { order: newOrder });
        } catch {
          showToast('Failed to save order', 'error');
        }
      },
    });
  }

  function openDeleteModal(word) {
    const surface = renderFuriganaText(word.word);
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Delete word?</div>
      </div>
      <div class="modal-body">
        <p>Delete "<strong lang="ja">${escapeHtml(surface)}</strong>"? This cannot be undone.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-danger" id="modal-confirm">Delete</button>
      </div>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('modal-confirm').onclick = async () => {
      const btn = document.getElementById('modal-confirm');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm"></span>';
      try {
        await api.delete(`/collections/${cid}/decks/${did}/words/${word.id}`);
        closeModal();
        showToast('Word deleted', 'success');
        words = words.filter(w => w.id !== word.id);
        renderList(words);
      } catch {
        showToast('Failed to delete', 'error');
        closeModal();
      }
    };
  }

  // ── Add word modal ─────────────────────────────────────────────
  function openWordModal(existing) {
    const isEdit = !!existing;
    const initDefs = isEdit
      ? existing.definitions
      : [{ english_definition: '', sentences: [] }];

    showModal(`
      <div class="modal-header">
        <div class="modal-title">${isEdit ? 'Edit Word' : 'Add Word'}</div>
      </div>
      <div class="modal-body" id="word-modal-body">
        <div class="form-group">
          <label class="form-label" for="wm-word">Japanese Word</label>
          <input id="wm-word" class="form-input ja-input" type="text" lang="ja"
            placeholder="e.g. 猫" value="${isEdit ? escapeHtml(existing.word?.surface || '') : ''}" autocomplete="off">
          <div class="form-error" id="wm-word-err" style="display:none"></div>
        </div>

        <div class="word-section-title" style="margin-bottom:10px">Definitions</div>
        <div id="wm-defs"></div>
        <button class="btn-ghost" id="wm-add-def" style="width:100%;margin-top:4px">+ Add Definition</button>

        <div class="form-group" style="margin-top:16px">
          <label class="form-label" for="wm-notes">Notes <span class="text-secondary">(optional)</span></label>
          <textarea id="wm-notes" class="form-textarea" placeholder="Any personal notes…"
            maxlength="1000" autocomplete="off">${isEdit ? escapeHtml(existing.user_notes || '') : ''}</textarea>
        </div>
      </div>
      <div id="wm-dup-warning" class="duplicate-warning" style="display:none;margin:0 20px 8px"></div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-save">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('wm-word').focus();

    // Build definition list
    const defsContainer = document.getElementById('wm-defs');
    const defData = initDefs.map(d => ({
      english_definition: d.english_definition || '',
      sentences: (d.sentences || []).map(s => ({
        surface: s.surface || '',
        en: s.en || '',
      })),
    }));

    function renderDefs() {
      defsContainer.innerHTML = defData.map((def, di) => `
        <div class="form-section" data-def-idx="${di}">
          <div class="form-section-header">
            <span class="form-section-title">Definition ${di + 1}</span>
            ${defData.length > 1 ? `<button class="btn-ghost remove-def-btn" data-idx="${di}" style="font-size:0.8rem;padding:2px 8px">✕ Remove</button>` : ''}
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label">English meaning</label>
            <input class="form-input def-english" data-idx="${di}" type="text"
              placeholder="e.g. cat" value="${escapeHtml(def.english_definition)}" autocomplete="off">
          </div>
          <div class="form-label" style="margin-bottom:6px">Sentences <span class="text-secondary">(optional)</span></div>
          <div class="sentences-list" data-def-idx="${di}">
            ${def.sentences.map((s, si) => `
              <div class="sentence-row" data-sent-idx="${si}">
                <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                  <input class="form-input ja-input sent-surface" lang="ja" data-def="${di}" data-sent="${si}"
                    type="text" placeholder="Japanese sentence" value="${escapeHtml(s.surface)}" autocomplete="off">
                  <input class="form-input sent-en" data-def="${di}" data-sent="${si}"
                    type="text" placeholder="English translation" value="${escapeHtml(s.en)}" autocomplete="off">
                </div>
                <button class="btn-icon remove-sent-btn" data-def="${di}" data-sent="${si}" style="margin-top:0;flex-shrink:0">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            `).join('')}
          </div>
          <button class="btn-ghost add-sent-btn" data-def="${di}" style="font-size:0.82rem;margin-top:4px">+ Add Sentence</button>
        </div>
      `).join('');

      // Bind def remove
      defsContainer.querySelectorAll('.remove-def-btn').forEach(btn => {
        btn.onclick = () => {
          defData.splice(Number(btn.dataset.idx), 1);
          renderDefs();
        };
      });

      // Bind sentence add
      defsContainer.querySelectorAll('.add-sent-btn').forEach(btn => {
        btn.onclick = () => {
          defData[Number(btn.dataset.def)].sentences.push({ surface: '', en: '' });
          renderDefs();
          // Focus the new sentence input
          const allSurface = defsContainer.querySelectorAll(`.sent-surface[data-def="${btn.dataset.def}"]`);
          allSurface[allSurface.length - 1]?.focus();
        };
      });

      // Bind sentence remove
      defsContainer.querySelectorAll('.remove-sent-btn').forEach(btn => {
        btn.onclick = () => {
          defData[Number(btn.dataset.def)].sentences.splice(Number(btn.dataset.sent), 1);
          renderDefs();
        };
      });

      // Sync input values live
      defsContainer.querySelectorAll('.def-english').forEach(inp => {
        inp.oninput = () => { defData[Number(inp.dataset.idx)].english_definition = inp.value; };
      });
      defsContainer.querySelectorAll('.sent-surface').forEach(inp => {
        inp.oninput = () => { defData[Number(inp.dataset.def)].sentences[Number(inp.dataset.sent)].surface = inp.value; };
      });
      defsContainer.querySelectorAll('.sent-en').forEach(inp => {
        inp.oninput = () => { defData[Number(inp.dataset.def)].sentences[Number(inp.dataset.sent)].en = inp.value; };
      });
    }

    renderDefs();

    document.getElementById('wm-add-def').onclick = () => {
      defData.push({ english_definition: '', sentences: [] });
      renderDefs();
    };

    document.getElementById('modal-save').onclick = async () => {
      const wordSurface = document.getElementById('wm-word').value.trim();
      const wordErr     = document.getElementById('wm-word-err');
      const notes       = document.getElementById('wm-notes').value.trim();
      const saveBtn     = document.getElementById('modal-save');
      const dupWarning  = document.getElementById('wm-dup-warning');

      if (!wordSurface) {
        wordErr.textContent = 'Japanese word is required.';
        wordErr.style.display = 'block';
        document.getElementById('wm-word').focus();
        return;
      }

      wordErr.style.display = 'none';
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-sm"></span>';
      dupWarning.style.display = 'none';

      const payload = {
        word_surface: wordSurface,
        definitions: defData.map(d => ({
          english_definition: d.english_definition,
          sentences: d.sentences
            .filter(s => s.surface.trim())
            .map(s => ({ surface: s.surface.trim(), en: s.en.trim() })),
        })),
        user_notes: notes,
      };

      try {
        if (isEdit) {
          await api.patch(`/collections/${cid}/decks/${did}/words/${existing.id}`, {
            word_surface: payload.word_surface,
            definitions: payload.definitions,
            user_notes: payload.user_notes,
          });
          const fresh = await api.get(`/collections/${cid}/decks/${did}/words`);
          words = fresh;
          renderList(fresh);
          closeModal();
          showToast('Word updated', 'success');
        } else {
          const result = await api.post(`/collections/${cid}/decks/${did}/words`, payload);
          const fresh = await api.get(`/collections/${cid}/decks/${did}/words`);
          words = fresh;
          renderList(fresh);

          if (result.duplicates?.length) {
            const names = result.duplicates.map(d => `${d.collection_name} › ${d.deck_name}`).join(', ');
            dupWarning.textContent = `⚠ Also found in: ${names}`;
            dupWarning.style.display = 'block';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Done';
            saveBtn.onclick = closeModal;
          } else {
            closeModal();
            showToast('Word added', 'success');
          }
        }
      } catch (err) {
        showToast(err.message || 'Failed to save word', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save' : 'Add';
      }
    };
  }
}
