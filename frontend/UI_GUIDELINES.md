# Kotonoha — UI Design Guidelines

## 1. Core Philosophy

**One thing at a time.** Each view presents a single, focused task. Do not crowd a screen with multiple sections of unrelated information. The user should always know what they are looking at and what they can do.

**Clean and readable.** Prefer whitespace over information density. Large type, clear hierarchy, minimal chrome.

**Calm interactions.** Transitions are short (0.15–0.2s) and purposeful. Nothing blinks, jumps, or fights for attention.

---

## 2. Design Tokens

All visual values come from CSS custom properties defined in `:root`. Never hardcode colors, radii, or font stacks.

### Colors (default: Midnight theme)

| Token         | Value     | Usage                              |
|---------------|-----------|------------------------------------|
| `--bg`        | `#0f1117` | Page background                    |
| `--surface`   | `#1a1d27` | Card / modal background            |
| `--surface-el`| `#252940` | Elevated surface (hover, input bg) |
| `--border`    | `#2e3352` | Borders, dividers                  |
| `--text-1`    | `#eef0ff` | Primary text                       |
| `--text-2`    | `#8b91b3` | Secondary / muted text             |
| `--accent`    | `#6c6fff` | Interactive elements, focus rings  |
| `--accent-h`  | `#8b8fff` | Accent hover state                 |
| `--success`   | `#34d399` | Positive feedback                  |
| `--warning`   | `#fbbf24` | Overdue / caution states           |
| `--danger`    | `#f87171` | Destructive actions, errors        |

Additional themes (`amber`, `slate`, `mist`) override the same tokens so all components automatically adapt.

### Radii

| Token        | Value | Usage                   |
|--------------|-------|-------------------------|
| `--radius`   | 12px  | Cards, modals           |
| `--radius-sm`| 8px   | Buttons, inputs, badges |

### Header height

| Token        | Default | Desktop (≥1024px) |
|--------------|---------|-------------------|
| `--header-h` | 64px    | 68px              |

---

## 3. Typography

### Fonts

- **UI font**: `Outfit` (Google Fonts), fallback to `system-ui, -apple-system, sans-serif`
- **Japanese font**: `Hiragino Sans → Hiragino Kaku Gothic ProN → Noto Sans JP → Meiryo`

Always set `lang="ja"` on Japanese text elements so the browser uses the correct font.

### Font size scale

Base font size is set on `html, body` and scales with viewport:

| Breakpoint | Base size | Effect                          |
|------------|-----------|---------------------------------|
| Mobile     | 19px      | All `rem` values scale from this |
| ≥ 600px    | 21px      | Tablet / large phone            |
| ≥ 1024px   | 23px      | Desktop                         |

Use `rem` units for all text sizes so they scale automatically.

### Key text sizes

| Element               | Size (mobile) | Notes                          |
|-----------------------|---------------|--------------------------------|
| Page title            | 1.75rem       | `font-weight: 600`             |
| Card name             | 1.2rem        | `font-weight: 500`             |
| Japanese word in list | 1.7rem        | `line-height: 1.9` for furigana|
| Japanese word detail  | 3.5rem → 4.5rem | Scales up at each breakpoint |
| Definition / sentence | 1.3rem        |                                |
| Body / secondary text | 1rem          |                                |
| Labels / badges       | 0.85rem       |                                |
| Section titles (caps) | 0.9rem        | Uppercase, letter-spacing      |

**Never go below 0.75rem for any readable text.** Labels smaller than this should be reconsidered.

### Furigana (ruby text)

Furigana is rendered via `<ruby>/<rt>` elements. `rt` size is `0.55em` relative to the base kanji. Users can toggle furigana off; the body class `furigana-off` hides all `rt` elements instantly with a CSS rule — no re-render needed.

---

## 4. Layout

### App shell

```
┌──────────────────────────────────┐
│  .app-header  (fixed, 64px)      │
├──────────────────────────────────┤
│                                  │
│  .app-main  (scrollable)         │
│                                  │
└──────────────────────────────────┘
```

- `html, body` have `overflow: hidden` — only `.app-main` scrolls.
- Scrollbars are hidden (`scrollbar-width: none`) to keep the UI clean. Touch scrolling is kept smooth with `-webkit-overflow-scrolling: touch`.
- Content area padding: `20px 16px 40px` (mobile) → `24px 24px 48px` (tablet) → `36px 40px 72px` (desktop).
- The app container caps at **900px** on desktop and is centered with `margin: 0 auto` and side borders.

### Responsive breakpoints

| Breakpoint | Width  | Changes                                      |
|------------|--------|----------------------------------------------|
| Mobile     | < 600px| Base layout, 19px font                       |
| Tablet     | ≥ 600px| 21px font, wider card gaps, wide modal variant|
| Desktop    | ≥ 1024px| 23px font, taller header, larger padding, 900px max-width |

Build **mobile-first**: write base styles for mobile, then override with `@media (min-width: ...)`.

---

## 5. Navigation

### Header

Each view renders its own `<header class="app-header">`. The header contains:

1. A **back button** (`.btn-back`) or the app logo on top-level views.
2. A **title / breadcrumb** that shows context (e.g., `Collection › Deck`). Keep it to one line, truncate with ellipsis.
3. Optional **icon buttons** (`.btn-icon`, 44×44px touch target) for view-specific actions.

Do not put more than two or three icon buttons in the header. Move secondary actions into a modal or inline menu.

### Breadcrumbs

Show breadcrumbs as compact `text-2` text in the header title area. Use `›` as the separator. Keep the full path but truncate with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.

### Hash routing

Navigation uses `window.location.hash` (`#/collections`, `#/decks/:cid`, etc.). Use the `navigate(hash)` utility; never manipulate `location.hash` directly in view code.

### Word-to-word navigation

- **Mobile**: swipe left/right on the content area (≥50px threshold).
- **Desktop**: arrow keys (← →). Keyboard handler is attached on view mount and removed on `hashchange`.
- Both methods update only the content area, not the full layout, to prevent flicker.

---

## 6. Preventing Screen Flicker

Flicker is caused by tearing down and rebuilding DOM between navigations. Mitigate it:

1. **Client-side cache**: Store fetched data in `state.wordsCache`, `state.decksCache`, etc. On back-navigation, render from cache immediately before any network request completes.
2. **Partial DOM updates**: When navigating between words in the same deck, update only `#word-content` and the header nav controls — keep the outer layout intact. Check `data-word-cid` / `data-word-did` attributes to detect same-deck context.
3. **Apply persisted preferences before first render**: Read `localStorage` (theme, furigana) synchronously in a `<script>` tag in `<head>` before `style.css` is parsed, so there is no flash of wrong theme/style.
4. **CSS transitions only**: Use `transition` for color/background/opacity changes. Never use JavaScript animation for UI state changes that CSS can handle.

---

## 7. Components

### Buttons

| Class           | Usage                               |
|-----------------|-------------------------------------|
| `.btn-primary`  | Main call-to-action (one per view)  |
| `.btn-secondary`| Alternative / cancel actions        |
| `.btn-danger`   | Destructive confirm (inside modal)  |
| `.btn-ghost`    | Low-emphasis inline actions         |
| `.btn-icon`     | 44×44px icon-only, in headers       |
| `.btn-back`     | Accent-colored back link            |

All buttons inherit the app font family. Disabled state uses `opacity: 0.5; cursor: not-allowed`. Never remove disabled state styling — it is a key affordance.

Minimum touch target: **44×44px** for any interactive element on mobile.

### Cards

`.card` and `.word-item` follow the same pattern:

```
[ drag handle ][ .card-body (flex:1, clickable) ][ .card-actions ]
```

- Hover: `border-color: var(--accent); background: var(--surface-el)`
- The entire body area is the click target; action buttons sit at the right edge.
- Cards stack vertically with `gap: 14px` (mobile) / `gap: 16px` (tablet+).

### Modals

Modals use a shared overlay (`#modal-overlay`) with blur backdrop (`backdrop-filter: blur(4px)`).

- Max width: 480px (standard) / 680px (`.modal-box--wide` for forms, ≥600px).
- Max height: 90vh; body scrolls internally.
- Entry animation: slide up + scale in (`translateY(16px) scale(0.97)` → natural, 0.2s).
- Close on: backdrop click, Escape key.
- Modal body scrollbar is hidden. Modal footer stays fixed at the bottom.
- Modals are for **focused tasks only** (confirm, edit a single item). Do not nest modals.

### Badges

Pill-shaped (`border-radius: 99px`) status indicators. Use sparingly — one or two per list item maximum.

| Class              | Meaning            |
|--------------------|--------------------|
| `.badge-learning`  | FSRS learning state |
| `.badge-review`    | FSRS review state  |
| `.badge-relearning`| FSRS relearning    |
| `.badge-tag`       | Neutral tag / label|

### Toast notifications

Bottom-centered, auto-dismiss after 3s. Fade in/out with `opacity` + `translateY`. Never stack more than 2–3 toasts. Use `toast-success` and `toast-error` variants. Toasts are non-interactive (`pointer-events: none`).

### Toggle switch

Use `.toggle-switch` + `.on` for boolean settings. Always pair with a label and sub-label. Make the entire row (`.pause-toggle`) the click target, not just the switch knob. Include `role="button"` and `aria-pressed` for accessibility.

### App footer

Some views (Word detail, word form) have a persistent action bar at the bottom. Use `.app-footer` as a `<footer>` sibling of `.app-main` inside `.view-layout`. Place a single `.btn-primary` or `.btn-secondary` inside it with the `.app-footer-btn` class (full-width, max 360px).

Add `body.has-footer` when the footer is visible so toasts shift up above it. Remove the class on navigation away (the router does this automatically).

Do not use the footer for navigation or secondary actions — one button maximum.

### Forms

- Labels: small (`0.82rem`), uppercase letter-spacing, `--text-2` color.
- Inputs/textareas: `--surface-el` background, accent border on focus.
- Japanese inputs: add `.ja-input` for the correct font and larger size.
- Group related fields in `.form-section` cards.
- Show errors in `.form-error` (danger color) directly below the relevant field.

### Empty states

Every list view must have an empty state:

```html
<div class="empty-state">
  <div class="empty-state-icon">📝</div>
  <div class="empty-state-title">Short title</div>
  <div class="empty-state-desc">One-line hint</div>
</div>
```

Icon: emoji at `2.5rem`. Title: `--text-1`. Description: `--text-2`.

### Loading states

Show a centered spinner while data is loading. Replace the spinner with content or an error state once the fetch resolves. Never leave the user looking at a blank screen.

---

## 8. Color Semantics

- Use `--text-1` for primary content, `--text-2` for metadata / supporting info.
- Use `--accent` only for interactive affordances (links, focus states, active selections).
- Use `--success` / `--warning` / `--danger` strictly for their semantic meaning. Do not use them for decoration.
- Section titles use `text-transform: uppercase; letter-spacing: 0.08em` with `--text-2` color to create visual hierarchy without adding weight.

---

## 9. Information Hierarchy Per View

Each view should have **one primary action** and at most **two secondary actions** visible without scrolling.

| View        | Primary focus              | Primary action  |
|-------------|----------------------------|-----------------|
| Collections | List of collections        | + New Collection|
| Decks       | List of decks in a collection | + New Deck   |
| Words       | List of words in a deck    | + Add Word      |
| Word detail | Word, definitions, notes   | Edit (header)   |
| Settings    | User preferences           | Save (per section) |

Do not show FSRS statistics prominently in list views. Surface them in the word detail view where the user is focused on a single word.

---

## 10. Accessibility

- Set `lang="ja"` on all Japanese text elements.
- All interactive elements must have a `title` or visible label.
- Keyboard-interactive custom controls (toggles, nav buttons) need `tabindex="0"` and keydown handlers for Enter/Space.
- Icon-only buttons must have a `title` attribute.
- Use `aria-pressed` on toggle buttons.
- Maintain sufficient contrast: `--text-1` on `--bg` and `--surface` must meet WCAG AA (4.5:1).
