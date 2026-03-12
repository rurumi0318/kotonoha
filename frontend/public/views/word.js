import { api } from '../api.js';
import { state } from '../state.js';
import { renderFurigana, renderFuriganaText } from '../furigana.js';
import {
  navigate, showToast, showModal, closeModal, escapeHtml,
  fsrsStateLabel, formatDate, formatDateFull, round2,
} from '../utils.js';

export default async function renderWord(app, cid, did, wid) {
  if (!cid || !did || !wid) { navigate('#/collections'); return; }

  app.innerHTML = `
    <div class="view-layout">
      <header class="app-header">
        <button class="btn-back" id="back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Words
        </button>
        <div class="header-title" id="word-header-title"></div>
        <button class="btn-icon" id="edit-btn" title="Edit word">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </header>
      <main class="app-main">
        <div id="word-content">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </main>
    </div>
  `;

  document.getElementById('back-btn').onclick = () => navigate(`#/words/${cid}/${did}`);

  let word = null;

  try {
    const words = await api.get(`/collections/${cid}/decks/${did}/words`);
    word = words.find(w => w.id === wid);
    if (!word) throw new Error('Word not found');
    renderWordDetail(word);
  } catch (err) {
    document.getElementById('word-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Word not found</div>
      </div>`;
    showToast('Failed to load word', 'error');
  }

  function renderWordDetail(w) {
    const surface = renderFuriganaText(w.word);
    document.getElementById('word-header-title').textContent = surface;

    const fsrs = w.fsrs_data || {};
    const colName  = state.collectionName || '';
    const deckName = state.deckName || '';
    const breadcrumb = [colName, deckName].filter(Boolean).join(' › ');

    document.getElementById('word-content').innerHTML = `
      <div class="word-detail">
        ${breadcrumb ? `<div class="breadcrumb">${escapeHtml(breadcrumb)}</div>` : ''}

        <div class="word-surface-lg" lang="ja">${renderFurigana(w.word)}</div>

        <!-- Definitions -->
        <div class="word-section">
          <div class="word-section-title">Definitions</div>
          ${(w.definitions || []).map((def, i) => `
            <div class="definition-card">
              <div class="definition-english">${i + 1}. ${escapeHtml(def.english_definition)}</div>
              ${(def.sentences || []).map(s => `
                <div class="sentence-item">
                  <div class="sentence-ja" lang="ja">${renderFurigana(s)}</div>
                  ${s.en ? `<div class="sentence-en">${escapeHtml(s.en)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `).join('')}
          ${!w.definitions?.length ? '<p class="text-secondary text-sm">No definitions yet.</p>' : ''}
        </div>

        <!-- Notes -->
        <div class="word-section">
          <div class="word-section-title">Notes</div>
          <div class="notes-text">${escapeHtml(w.user_notes || '') || '<span class="text-secondary">—</span>'}</div>
        </div>

        <!-- FSRS -->
        <div class="word-section">
          <div class="word-section-title">Progress</div>
          <div class="fsrs-grid">
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">State</div>
              <div class="fsrs-cell-value">${escapeHtml(fsrsStateLabel(fsrs.state))}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Due</div>
              <div class="fsrs-cell-value">${formatDate(fsrs.due_date)}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Last Review</div>
              <div class="fsrs-cell-value">${formatDateFull(fsrs.last_review)}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Stability</div>
              <div class="fsrs-cell-value">${fsrs.stability != null ? round2(fsrs.stability) + 'd' : '—'}</div>
            </div>
            <div class="fsrs-cell">
              <div class="fsrs-cell-label">Difficulty</div>
              <div class="fsrs-cell-value">${fsrs.difficulty != null ? round2(fsrs.difficulty) : '—'}</div>
            </div>
          </div>
        </div>

        <!-- Pause toggle -->
        <div class="word-section">
          <div class="word-section-title">Status</div>
          <div class="pause-toggle" id="pause-toggle" role="button" tabindex="0" aria-pressed="${w.is_paused}">
            <div>
              <div class="pause-toggle-label">Paused</div>
              <div class="pause-toggle-sub">Paused words are excluded from reviews.</div>
            </div>
            <div class="toggle-switch ${w.is_paused ? 'on' : ''}" id="pause-switch"></div>
          </div>
        </div>
      </div>
    `;

    // Pause toggle
    const toggle = document.getElementById('pause-toggle');
    toggle.addEventListener('click', async () => {
      const sw = document.getElementById('pause-switch');
      const newPaused = !w.is_paused;
      w.is_paused = newPaused;
      sw.classList.toggle('on', newPaused);
      toggle.setAttribute('aria-pressed', newPaused);
      try {
        await api.patch(`/collections/${cid}/decks/${did}/words/${wid}`, { is_paused: newPaused });
        showToast(newPaused ? 'Word paused' : 'Word unpaused', 'success');
      } catch {
        w.is_paused = !newPaused;
        sw.classList.toggle('on', !newPaused);
        showToast('Failed to update', 'error');
      }
    });
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });

    // Edit button
    document.getElementById('edit-btn').onclick = () => openEditModal(w);
  }

  function openEditModal(w) {
    const defData = (w.definitions || []).map(d => ({
      english_definition: d.english_definition || '',
      sentences: (d.sentences || []).map(s => ({
        surface: s.surface || '',
        en: s.en || '',
      })),
    }));
    if (!defData.length) defData.push({ english_definition: '', sentences: [] });

    showModal(`
      <div class="modal-header">
        <div class="modal-title">Edit Word</div>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="em-word">Japanese Word</label>
          <input id="em-word" class="form-input ja-input" type="text" lang="ja"
            placeholder="e.g. 猫" value="${escapeHtml(w.word?.surface || '')}" autocomplete="off">
        </div>
        <div class="word-section-title" style="margin-bottom:10px">Definitions</div>
        <div id="em-defs"></div>
        <button class="btn-ghost" id="em-add-def" style="width:100%;margin-top:4px">+ Add Definition</button>
        <div class="form-group" style="margin-top:16px">
          <label class="form-label" for="em-notes">Notes</label>
          <textarea id="em-notes" class="form-textarea" maxlength="1000" autocomplete="off">${escapeHtml(w.user_notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-save">Save</button>
      </div>
    `);

    document.getElementById('modal-cancel').onclick = closeModal;
    document.getElementById('em-word').focus();

    const defsContainer = document.getElementById('em-defs');

    function renderDefs() {
      defsContainer.innerHTML = defData.map((def, di) => `
        <div class="form-section">
          <div class="form-section-header">
            <span class="form-section-title">Definition ${di + 1}</span>
            ${defData.length > 1 ? `<button class="btn-ghost remove-def-btn" data-idx="${di}" style="font-size:0.8rem;padding:2px 8px">✕ Remove</button>` : ''}
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label">English meaning</label>
            <input class="form-input def-english" data-idx="${di}" type="text"
              placeholder="e.g. cat" value="${escapeHtml(def.english_definition)}" autocomplete="off">
          </div>
          <div class="form-label" style="margin-bottom:6px">Sentences</div>
          <div class="sentences-list">
            ${def.sentences.map((s, si) => `
              <div class="sentence-row">
                <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                  <input class="form-input ja-input sent-surface" lang="ja" data-def="${di}" data-sent="${si}"
                    type="text" placeholder="Japanese sentence" value="${escapeHtml(s.surface)}" autocomplete="off">
                  <input class="form-input sent-en" data-def="${di}" data-sent="${si}"
                    type="text" placeholder="English translation" value="${escapeHtml(s.en)}" autocomplete="off">
                </div>
                <button class="btn-icon remove-sent-btn" data-def="${di}" data-sent="${si}" style="flex-shrink:0">
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

      defsContainer.querySelectorAll('.remove-def-btn').forEach(btn => {
        btn.onclick = () => { defData.splice(Number(btn.dataset.idx), 1); renderDefs(); };
      });
      defsContainer.querySelectorAll('.add-sent-btn').forEach(btn => {
        btn.onclick = () => {
          defData[Number(btn.dataset.def)].sentences.push({ surface: '', en: '' });
          renderDefs();
        };
      });
      defsContainer.querySelectorAll('.remove-sent-btn').forEach(btn => {
        btn.onclick = () => {
          defData[Number(btn.dataset.def)].sentences.splice(Number(btn.dataset.sent), 1);
          renderDefs();
        };
      });
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
    document.getElementById('em-add-def').onclick = () => {
      defData.push({ english_definition: '', sentences: [] });
      renderDefs();
    };

    document.getElementById('modal-save').onclick = async () => {
      const wordSurface = document.getElementById('em-word').value.trim();
      const notes       = document.getElementById('em-notes').value.trim();
      const saveBtn     = document.getElementById('modal-save');

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-sm"></span>';

      try {
        const patch = {};
        if (wordSurface && wordSurface !== (w.word?.surface || '')) {
          patch.word_surface = wordSurface;
        }
        patch.definitions = defData.map(d => ({
          english_definition: d.english_definition,
          sentences: d.sentences.filter(s => s.surface.trim()).map(s => ({
            surface: s.surface.trim(),
            en: s.en.trim(),
          })),
        }));
        patch.user_notes = notes;

        await api.patch(`/collections/${cid}/decks/${did}/words/${wid}`, patch);
        closeModal();
        showToast('Word updated', 'success');

        // Reload word
        const fresh = await api.get(`/collections/${cid}/decks/${did}/words`);
        word = fresh.find(w => w.id === wid);
        if (word) renderWordDetail(word);
      } catch (err) {
        showToast(err.message || 'Failed to save', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };
  }
}
