function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a FuriganaSegment to an HTML string using <ruby> tags.
 * @param {object} segment - { surface, segments: [{t, r?}] }
 * @returns {string} HTML string
 */
export function renderFurigana(segment) {
  if (!segment) return '';
  if (typeof segment === 'string') return escapeHtml(segment);
  if (!segment.segments || segment.segments.length === 0) {
    return escapeHtml(segment.surface || '');
  }
  return segment.segments.map(tok => {
    const t = escapeHtml(tok.t || '');
    if (tok.r) {
      return `<ruby>${t}<rt>${escapeHtml(tok.r)}</rt></ruby>`;
    }
    return t;
  }).join('');
}

/**
 * Returns just the surface text (no ruby markup).
 * @param {object} segment
 * @returns {string}
 */
export function renderFuriganaText(segment) {
  if (!segment) return '';
  if (typeof segment === 'string') return segment;
  return segment.surface || '';
}

/**
 * Returns the full kana reading of a FuriganaSegment.
 * Each token uses its reading (r) if present, otherwise its surface (t).
 * Suitable for passing to TTS to avoid misread homographs (e.g. 明日→あした).
 * @param {object} segment - { surface, segments: [{t, r?}] }
 * @returns {string}
 */
export function segmentToKana(segment) {
  if (!segment) return '';
  if (typeof segment === 'string') return segment;
  if (!segment.segments || segment.segments.length === 0) return segment.surface || '';
  return segment.segments.map(tok => tok.r || tok.t || '').join('');
}
