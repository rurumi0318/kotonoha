import { api, vocabLookup } from '../api.js';
import { showModal, closeModal, escapeHtml, showToast } from '../utils.js';

/**
 * Opens the Add / Edit word modal with dictionary lookup.
 *
 * @param {object}       opts
 * @param {'add'|'edit'} opts.mode
 * @param {object|null}  opts.existing  Existing word object (edit mode only)
 * @param {string}       opts.cid       Collection ID
 * @param {string}       opts.did       Deck ID
 * @param {Function}     [opts.onSaved]   Called after a successful save
 * @param {Function}     [opts.onDeleted] Called after a successful delete (edit mode only)
 */
export function openWordModal({ mode, existing, cid, did, onSaved, onDeleted }) {
  const isEdit = mode === 'edit';

  const initDefs = isEdit
    ? (existing.definitions || []).map(d => ({
        english_definition: d.english_definition || '',
        sentences: (d.sentences || []).map(s => ({ surface: s.surface || '', en: s.en || '' })),
      }))
    : [{ english_definition: '', sentences: [] }];
  if (isEdit && !initDefs.length) initDefs.push({ english_definition: '', sentences: [] });

  let defData = initDefs;
  let lookupState = 'idle'; // 'idle' | 'loading' | 'results' | 'error' | 'empty'
  let lookupResults = [];
  let lookupQuery = '';      // word input value at the time of last lookup
  let committedIdseq = null; // idseq of the entry from which the first sense was added
  const addedSenses = new Set(); // "idseq_senseNo"

  showModal(`
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit Word' : 'Add Word'}</div>
    </div>
    <div class="modal-body" id="wm-body">
      <div class="form-group">
        <label class="form-label" for="wm-word">Japanese Word</label>
        <div class="wm-word-row">
          <input id="wm-word" class="form-input ja-input" type="text" lang="ja"
            placeholder="e.g. 猫"
            value="${isEdit ? escapeHtml(existing.word?.surface || '') : ''}"
            autocomplete="off">
          <button class="btn-secondary" id="wm-lookup-btn">Look up</button>
        </div>
        <div class="form-error" id="wm-word-err" style="display:none"></div>
      </div>

      <div class="form-group" style="margin-top:-4px">
        <label class="form-label" for="wm-hint">Reading <span class="text-secondary">(optional — helps distinguish words with the same kanji)</span></label>
        <input id="wm-hint" class="form-input ja-input" type="text" lang="ja"
          placeholder="e.g. にんき"
          value="${isEdit ? escapeHtml(existing.kana_hint || '') : ''}"
          autocomplete="off">
      </div>

      <div id="wm-lookup-zone"></div>

      <div class="wm-form-zone">
        <div style="margin-bottom:8px">
          <span style="font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-2)">Your Definitions</span>
        </div>
        <div id="wm-defs"></div>
        <button class="btn-ghost" id="wm-add-def" style="width:100%;margin-top:4px">+ Add Definition Manually</button>

        <div class="form-group" style="margin-top:16px">
          <label class="form-label" for="wm-notes">Notes <span class="text-secondary">(optional)</span></label>
          <textarea id="wm-notes" class="form-textarea" placeholder="Any personal notes…"
            maxlength="1000" autocomplete="off">${isEdit ? escapeHtml(existing.user_notes || '') : ''}</textarea>
        </div>
      </div>
    </div>
    <div id="wm-dup-warning" class="duplicate-warning" style="display:none;margin:0 20px 8px"></div>
    <div class="modal-footer">
      <button class="btn-secondary" id="modal-cancel">Cancel</button>
      ${isEdit ? '<button class="btn-danger" id="modal-delete">Delete</button>' : ''}
      <button class="btn-primary" id="modal-save">${isEdit ? 'Save' : 'Add'}</button>
    </div>
  `);

  // Widen modal on PC
  document.querySelector('.modal-box')?.classList.add('modal-box--wide');

  document.getElementById('modal-cancel').onclick = closeModal;

  if (isEdit) {
    document.getElementById('modal-delete').onclick = async () => {
      const deleteBtn = document.getElementById('modal-delete');
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = '<span class="spinner-sm"></span>';
      try {
        await api.delete(`/collections/${cid}/decks/${did}/words/${existing.id}`);
        closeModal();
        showToast('Word deleted', 'success');
        onDeleted?.();
      } catch {
        showToast('Failed to delete word', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
      }
    };
  }

  const wordInput = document.getElementById('wm-word');
  const hintInput = document.getElementById('wm-hint');
  wordInput.focus();

  // ── Lookup ────────────────────────────────────────────────────────

  function setFormFrozen(frozen) {
    const zone = document.querySelector('.wm-form-zone');
    if (zone) zone.classList.toggle('wm-form-disabled', frozen);
    const saveBtn = document.getElementById('modal-save');
    if (saveBtn) saveBtn.disabled = frozen;
    wordInput.disabled = frozen;
    hintInput.disabled = frozen;
    const lookupBtn = document.getElementById('wm-lookup-btn');
    if (lookupBtn) lookupBtn.disabled = frozen;
  }

  async function doLookup() {
    const q = wordInput.value.trim();
    if (!q) return;

    lookupQuery = q;
    lookupState = 'loading';
    lookupResults = [];
    committedIdseq = null;
    addedSenses.clear();
    renderLookupZone();
    setFormFrozen(true);

    try {
      const results = await vocabLookup(q);
      lookupResults = results || [];
      lookupState = lookupResults.length ? 'results' : 'empty';
    } catch {
      lookupState = 'error';
    }

    setFormFrozen(false);
    renderLookupZone();
  }

  document.getElementById('wm-lookup-btn').onclick = doLookup;
  wordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
  });

  // ── Lookup zone rendering ─────────────────────────────────────────

  function renderLookupZone() {
    const zone = document.getElementById('wm-lookup-zone');
    if (!zone) return;

    if (lookupState === 'idle') { zone.innerHTML = ''; return; }

    if (lookupState === 'loading') {
      zone.innerHTML = `
        <div class="wm-lookup-loading">
          <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
          <span>Looking up…</span>
        </div>`;
      return;
    }
    if (lookupState === 'error') {
      zone.innerHTML = `<div class="wm-lookup-msg">Failed to look up. Please try again.</div>`;
      return;
    }
    if (lookupState === 'empty') {
      zone.innerHTML = `<div class="wm-lookup-msg">No dictionary match — add definitions manually below.</div>`;
      return;
    }

    zone.innerHTML = `<div class="wm-lookup-results">${lookupResults.map((e, i) => renderEntry(e, i)).join('')}</div>`;
    bindLookupActions();
  }

  function renderEntry(entry, entryIdx) {
    // Once committed to an entry, hide all others
    if (committedIdseq !== null && entry.idseq !== committedIdseq) return '';

    const display = entry.kanji_forms[0] || entry.kana_forms[0] || '';
    const reading = entry.kanji_forms.length && entry.kana_forms[0] ? entry.kana_forms[0] : '';
    const sensesHtml = entry.senses
      .filter(s => s.gloss.length)
      .map(s => renderSense(s, entryIdx, entry.idseq))
      .join('');

    return `
      <div class="wm-entry">
        <div class="wm-entry-header">
          <span lang="ja" class="wm-entry-kanji">${escapeHtml(display)}</span>
          ${reading ? `<span class="wm-entry-reading" lang="ja">${escapeHtml(reading)}</span>` : ''}
        </div>
        ${sensesHtml}
      </div>`;
  }

  function renderSense(sense, entryIdx, idseq) {
    const key = `${idseq}_${sense.sense_no}`;
    const gloss = sense.gloss.join(', ');
    const pos = sense.pos[0] || '';

    if (addedSenses.has(key)) {
      return `
        <div class="wm-sense wm-sense--added">
          <div class="wm-sense-row">
            <span class="wm-sense-no">${sense.sense_no}.</span>
            <div class="wm-sense-body">
              <div class="wm-sense-gloss">${escapeHtml(gloss)}</div>
            </div>
            <span class="wm-sense-added-badge">✓ Added</span>
          </div>
        </div>`;
    }

    const examplesHtml = sense.examples.length
      ? `<div class="wm-examples">
          ${sense.examples.map((ex, xi) => `
            <label class="wm-example">
              <input type="checkbox" class="wm-example-check" checked
                data-entry-idx="${entryIdx}"
                data-sense-no="${sense.sense_no}"
                data-example-idx="${xi}">
              <div class="wm-example-body">
                <div class="wm-example-jp" lang="ja">${escapeHtml(ex.jp)}</div>
                <div class="wm-example-en">${escapeHtml(ex.en)}</div>
              </div>
            </label>`).join('')}
         </div>`
      : '';

    return `
      <div class="wm-sense" data-sense-key="${key}">
        <div class="wm-sense-row">
          <span class="wm-sense-no">${sense.sense_no}.</span>
          <div class="wm-sense-body">
            <div class="wm-sense-gloss">${escapeHtml(gloss)}</div>
            ${pos ? `<div class="wm-sense-pos">${escapeHtml(pos)}</div>` : ''}
          </div>
          <button class="btn-ghost wm-add-sense-btn"
            data-sense-key="${key}"
            data-entry-idx="${entryIdx}"
            data-gloss="${escapeHtml(gloss)}">+ Add</button>
        </div>
        ${examplesHtml}
      </div>`;
  }

  function bindLookupActions() {
    const zone = document.getElementById('wm-lookup-zone');
    if (!zone) return;

    zone.querySelectorAll('.wm-add-sense-btn').forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.senseKey;
        const gloss = btn.dataset.gloss;
        const entryIdx = parseInt(btn.dataset.entryIdx);
        const entry = lookupResults[entryIdx];

        // On first add: commit to this entry and auto-fill word + hint
        if (committedIdseq === null) {
          committedIdseq = entry.idseq;

          const primaryForm = entry.kanji_forms[0] ?? entry.kana_forms[0] ?? '';
          const primaryReading = entry.kana_forms[0] ?? '';

          // Auto-fill word input only if still matches the original lookup query
          if (wordInput.value.trim() === lookupQuery) {
            wordInput.value = primaryForm;
          }
          // Auto-fill hint only if the user hasn't typed anything
          if (!hintInput.value.trim()) {
            hintInput.value = primaryReading;
          }
        }

        // Collect checked examples from this sense's block
        const senseEl = zone.querySelector(`.wm-sense[data-sense-key="${key}"]`);
        const sentences = senseEl
          ? [...senseEl.querySelectorAll('.wm-example-check:checked')].map(cb => {
              const e = lookupResults[parseInt(cb.dataset.entryIdx)];
              const s = e.senses.find(s => s.sense_no === parseInt(cb.dataset.senseNo));
              const ex = s.examples[parseInt(cb.dataset.exampleIdx)];
              return { surface: ex.jp, en: ex.en };
            })
          : [];

        // Fill the last empty definition slot; otherwise append a new one
        const last = defData[defData.length - 1];
        if (last && !last.english_definition && !last.sentences.length) {
          last.english_definition = gloss;
          last.sentences = sentences;
        } else {
          defData.push({ english_definition: gloss, sentences });
        }

        addedSenses.add(key);
        renderDefs();
        renderLookupZone();
      };
    });
  }

  // ── Definitions ───────────────────────────────────────────────────

  const defsContainer = document.getElementById('wm-defs');

  function renderDefs() {
    defsContainer.innerHTML = defData.map((def, di) => `
      <div class="form-section" data-def-idx="${di}">
        <div class="form-section-header">
          <span class="form-section-title">Definition ${di + 1}</span>
          ${defData.length > 1
            ? `<button class="btn-ghost remove-def-btn" data-idx="${di}" style="font-size:0.8rem;padding:2px 8px">✕ Remove</button>`
            : ''}
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <label class="form-label">English meaning</label>
          <input class="form-input def-english" data-idx="${di}" type="text"
            placeholder="e.g. cat" value="${escapeHtml(def.english_definition)}" autocomplete="off">
        </div>
        <div class="form-label" style="margin-bottom:6px">Sentences <span class="text-secondary">(optional)</span></div>
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
        const all = defsContainer.querySelectorAll(`.sent-surface[data-def="${btn.dataset.def}"]`);
        all[all.length - 1]?.focus();
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

  document.getElementById('wm-add-def').onclick = () => {
    defData.push({ english_definition: '', sentences: [] });
    renderDefs();
  };

  // ── Save ──────────────────────────────────────────────────────────

  document.getElementById('modal-save').onclick = async () => {
    const wordSurface = wordInput.value.trim();
    const kanaHint   = hintInput.value.trim();
    const wordErr    = document.getElementById('wm-word-err');
    const notes      = document.getElementById('wm-notes').value.trim();
    const saveBtn    = document.getElementById('modal-save');
    const dupWarning = document.getElementById('wm-dup-warning');

    if (!wordSurface) {
      wordErr.textContent = 'Japanese word is required.';
      wordErr.style.display = 'block';
      wordInput.focus();
      return;
    }

    wordErr.style.display = 'none';
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-sm"></span>';
    dupWarning.style.display = 'none';

    const definitions = defData.map(d => ({
      english_definition: d.english_definition,
      sentences: d.sentences
        .filter(s => s.surface.trim())
        .map(s => ({ surface: s.surface.trim(), en: s.en.trim() })),
    }));

    try {
      if (isEdit) {
        const patch = { kana_hint: kanaHint, definitions, user_notes: notes };
        if (wordSurface !== (existing.word?.surface || '')) {
          patch.word_surface = wordSurface;
        }
        await api.patch(`/collections/${cid}/decks/${did}/words/${existing.id}`, patch);
        closeModal();
        showToast('Word updated', 'success');
        onSaved?.();
      } else {
        const result = await api.post(`/collections/${cid}/decks/${did}/words`, {
          word_surface: wordSurface,
          kana_hint: kanaHint,
          definitions,
          user_notes: notes,
        });
        onSaved?.();
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
