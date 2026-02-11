# 11 — Implementation Sequence

## Overview
The implementation is structured so that each phase produces a working, visually coherent app. No phase should leave the app in a "half-redesigned" state.

**Estimated scope:** ~3,500 lines of CSS changes, ~800 lines of JSX changes.

---

## Phase 1: Design System Foundation (index.css only)

**Goal:** Replace the entire CSS variable system and base styles. After this phase, the app will look different (colors, typography, spacing) but structurally identical.

### Steps:
1. Replace `:root` variables with new warm slate palette
2. Replace `:root.dark` variables with new dark palette
3. Update `body` styles (font-family, background, letter-spacing)
4. Update `html, body` resets
5. Update `.app` container (max-width 600px, padding adjustments)
6. Remove all `linear-gradient` button overrides in dark mode section
7. Replace shadow variables
8. Update border-radius variables
9. Update typography scale variables
10. Add new variables: `--accent`, `--primary-50`, `--bg-subtle`, status text colors, transition tokens, spacing tokens

**Files:** `index.css` only
**Risk:** Low — only variables and base styles

---

## Phase 2: Header & Navigation (index.css + App.jsx)

**Goal:** Redesign header and bottom nav. After this phase, navigation looks production-ready.

### Steps:
1. Update `.header` styles:
   - Sticky positioning
   - New height (52px), centered layout
   - Brand text left, avatar right
2. Update header JSX in AppContent:
   - Replace `<h1>` with proper brand treatment
   - Add user avatar circle (initials) replacing SettingsMenu in header
   - Add avatar-click popover for settings (lightweight, not bottom sheet)
3. Update `.bottom-nav` styles:
   - New height (64px), new colors (navy active)
   - Lighter icon strokes (1.5 not 2)
   - Badge redesign (smaller, with card-colored border)
4. Update `BottomNav` component JSX:
   - Replace SVG icons with thinner stroke versions
   - Update tab labels if needed
   - Update "Scan" tab to reference detect view
5. Update `.more-menu` styles:
   - Add handle bar
   - Update item spacing and typography
   - Add dark mode toggle switch (visual only — functionality exists)
   - Slide-up animation
6. Update BottomNav's More menu JSX:
   - Add handle bar div
   - Add toggle switch for dark mode
   - Update menu item icons and labels

**Files:** `index.css`, `App.jsx`
**Risk:** Medium — structural JSX changes in nav

---

## Phase 3: Cards, Buttons & Inputs (index.css mostly)

**Goal:** Make every card, button, and input consistent with the design system.

### Steps:
1. Update `.stat-card` styles (left border accent, new padding, no hover transform)
2. Update `.alert-banner` styles (clean left border, no gradient)
3. Update `.inventory-item` card styles (new padding, border behavior, no transform)
4. Update `.alert-card` styles (action required cards)
5. Update `.btn` base and all variants (btn-primary as navy, no gradients, no translateY)
6. Add `.btn-ghost` style
7. Update form inputs (`.form-group input`, select, textarea)
8. Update `.quantity-input` and `.quantity-btn` styles
9. Update `.modal-overlay` and `.modal` styles (animation, handle bar, new spacing)
10. Update `.mode-toggle` / `.mode-btn` styles
11. Update `.custom-dropdown` styles
12. Remove all remaining `linear-gradient` and `transform: translateY` rules

**Files:** `index.css` primarily, minor JSX for any class name changes
**Risk:** Low — mostly CSS, high impact

---

## Phase 4: Dashboard Redesign (index.css + App.jsx)

**Goal:** Dashboard looks like a professional morning briefing.

### Steps:
1. Add time-based greeting logic to Dashboard component
2. Add dynamic status subtitle
3. Redesign stats grid cards (add value formatting, inventory value card)
4. Replace Quick Count CTA (from gradient button to subtle card with dashed border)
5. Redesign "Needs Attention" section:
   - New section header style (small caps + line)
   - New alert card layout (compact, with ghost action buttons)
   - Better status messages (days remaining, usage-aware copy)
6. Redesign Recent Activity section (compact table rows)
7. Update empty dashboard state (icon + warm copy + two CTAs)
8. Add/update CSS for all new dashboard classes
9. Update dark mode overrides for dashboard

**Files:** `App.jsx` (Dashboard component), `index.css`
**Risk:** Medium — significant JSX restructuring in Dashboard

---

## Phase 5: Inventory List (index.css + App.jsx)

**Goal:** Inventory list is fast, scannable, and well-organized.

### Steps:
1. Update InventoryList page header (title + subtitle + Add button)
2. Replace custom dropdown filter with horizontal pill tabs
   - "All" / "Low Stock {n}" / "Order Soon {n}" / "By Category"
3. Update default view: group by stock status instead of just listing
   - Section headers: "Low Stock (3)" / "Getting Low (5)" / "Well Stocked (16)"
4. Update InventoryItemCard component:
   - Compact layout with progress mini-bar
   - Better status text logic
   - Omit redundant "In stock" text for well-stocked items
5. Update category view section headers
6. Update empty states (both no items and filtered-empty)
7. Update CSS for all inventory list elements
8. Update filter banner (if keeping)

**Files:** `App.jsx` (InventoryList, InventoryItemCard), `index.css`
**Risk:** Medium — changes to list rendering logic

---

## Phase 6: Scan & Detection Page (index.css + App.jsx)

**Goal:** AI detection feels like magic, not a debug interface.

### Steps:
1. Update DetectView camera container (corner markers, cleaner aspect ratio)
2. Update upload drop zone (dashed border, cleaner text)
3. Update processing overlay (dark overlay, clean spinner, warm text)
4. Redesign results view:
   - Cleaner header with processing time
   - Inline-editable items (look like text until focused)
   - Better confidence badges
   - Grid visualization hidden by default
5. Update service unavailable state (no spinner by default, clean retry)
6. Update barcode scan view (scanner styling, recent scans)
7. Update CSS for detect/scan classes
8. Clean up detect dark mode overrides

**Files:** `App.jsx` (DetectView, BarcodeScanner), `index.css`
**Risk:** Medium — detection result display is complex

---

## Phase 7: Quick Count (index.css + App.jsx)

**Goal:** Quick Count feels like a satisfying daily ritual.

### Steps:
1. Update location picker cards (cleaner grid, better hover states)
2. Update count entry header (back button + progress)
3. Update progress bar (thinner, subtler)
4. Update count item cards (cleaner input group, counted state)
5. Update sticky submit bar positioning (above bottom nav)
6. Update success screen (spring animation on checkmark)
7. Update variance summary table
8. Update CSS for all qc- prefixed classes

**Files:** `App.jsx` (QuickCountView), `index.css`
**Risk:** Low — mostly visual changes

---

## Phase 8: Orders, Suppliers, Waste (index.css + App.jsx)

**Goal:** Secondary pages match the quality of primary ones.

### Steps:
1. Update RestockList page header and smart fill card
2. Update order item rows (single container card, not individual cards)
3. Update order summary footer
4. Update SuppliersView layout (single container card for list)
5. Update supplier modal form
6. Update WasteReport header and period selector
7. Update waste summary cards (3-across grid)
8. Update waste breakdown charts (cleaner bars)
9. Update waste log rows
10. Update all empty states for these pages
11. Update CSS for restock, supplier, waste classes

**Files:** `App.jsx` (RestockList, SuppliersView, WasteReport), `index.css`
**Risk:** Low-Medium — multiple pages but similar pattern

---

## Phase 9: Modals & Auth (index.css + App.jsx)

**Goal:** Every modal and the auth screen is polished.

### Steps:
1. Update QuickUpdateModal layout and content
   - Item header card, stock summary, mode toggle, quantity input, footer
2. Update ItemModal form layout (two-column fields where appropriate)
3. Update ThresholdEditModal (simplified)
4. Update LogWasteModal (reason grid, cost input)
5. Update modal animations (slide-up, handle bar)
6. Update AuthScreen:
   - Remove gradient text
   - Solid navy brand name
   - Warm subtitle
   - Clean error display
   - Mode switch at bottom
7. Update toast/alert notifications (dark bg, left accent)
8. Update loading spinner

**Files:** `App.jsx` (all modals, AuthScreen), `index.css`
**Risk:** Medium — modals have complex state

---

## Phase 10: Final Polish (index.css)

**Goal:** Everything is coherent, nothing is missed.

### Steps:
1. Audit all remaining CSS for old values (grep for old hex codes, old variable names)
2. Verify all transitions use defined tokens
3. Verify all border-radius values use tokens
4. Test dark mode — every element should be intentional
5. Test on 375px viewport (iPhone SE) — nothing should overflow
6. Test on 414px viewport (iPhone 14) — primary target
7. Test on 768px viewport (iPad) — centered, clean
8. Remove any orphaned CSS rules (classes no longer used)
9. Remove commented-out code
10. Final pass on all copy text — every string should be intentional

**Files:** `index.css`, `App.jsx`
**Risk:** Low — polish pass

---

## Summary

| Phase | Focus | Files | Risk |
|-------|-------|-------|------|
| 1 | Design System Foundation | CSS | Low |
| 2 | Header & Navigation | CSS + JSX | Medium |
| 3 | Cards, Buttons & Inputs | CSS | Low |
| 4 | Dashboard Redesign | CSS + JSX | Medium |
| 5 | Inventory List | CSS + JSX | Medium |
| 6 | Scan & Detection | CSS + JSX | Medium |
| 7 | Quick Count | CSS + JSX | Low |
| 8 | Orders, Suppliers, Waste | CSS + JSX | Low-Medium |
| 9 | Modals & Auth | CSS + JSX | Medium |
| 10 | Final Polish | CSS + JSX | Low |

Each phase should be committed separately to allow easy rollback if needed.
