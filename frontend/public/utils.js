export function navigate(hash) {
  window.location.hash = hash;
}

// ── Toast ──────────────────────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('visible'));
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
}

// ── Modal ──────────────────────────────────────────────────────────
export function showModal(html) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal-box">${html}</div>`;
  overlay.classList.remove('hidden');

  const onBdClick = (e) => {
    if (e.target === overlay) closeModal();
  };
  overlay.addEventListener('mousedown', onBdClick);
  overlay.addEventListener('touchstart', onBdClick);
  overlay._bdHandler = onBdClick;

  const onEsc = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', onEsc);
  overlay._escHandler = onEsc;

  return overlay.querySelector('.modal-box');
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');

  if (overlay._bdHandler) {
    overlay.removeEventListener('mousedown', overlay._bdHandler);
    overlay.removeEventListener('touchstart', overlay._bdHandler);
    overlay._bdHandler = null;
  }
  if (overlay._escHandler) {
    document.removeEventListener('keydown', overlay._escHandler);
    overlay._escHandler = null;
  }

  // Clear content after fade
  setTimeout(() => {
    if (overlay.classList.contains('hidden')) overlay.innerHTML = '';
  }, 250);
}

// ── Date formatting ────────────────────────────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffMs = date - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 0)  return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 30)  return `in ${diffDays}d`;
  return date.toLocaleDateString();
}

export function formatDateFull(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── FSRS helpers ───────────────────────────────────────────────────
// Backend states: 1=Learning, 2=Review, 3=Relearning
export function fsrsStateBadge(stateNum) {
  const map = {
    1: { label: 'Learning',   cls: 'badge-learning' },
    2: { label: 'Review',     cls: 'badge-review' },
    3: { label: 'Relearning', cls: 'badge-relearning' },
  };
  const s = map[stateNum] || { label: 'Learning', cls: 'badge-learning' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

export function fsrsStateLabel(stateNum) {
  const map = { 1: 'Learning', 2: 'Review', 3: 'Relearning' };
  return map[stateNum] || 'Learning';
}

export function stabilityIcon(avgStability) {
  if (avgStability === null || avgStability === undefined || isNaN(avgStability)) return '🌱';
  if (avgStability < 3)  return '🌱';
  if (avgStability < 14) return '🌿';
  return '🌳';
}

// ── Misc ───────────────────────────────────────────────────────────
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}
