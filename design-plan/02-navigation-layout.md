# 02 — Navigation & Layout

## Page Structure

```
┌─────────────────────────────────┐
│ Header (sticky top, 52px)       │
│  "Mike's Inventory"    [avatar] │
├─────────────────────────────────┤
│                                 │
│  Page Content                   │
│  (scrollable)                   │
│  max-width: 600px               │
│  padding: 0 16px                │
│                                 │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│ Bottom Nav (fixed, 64px)        │
│ Home  Items  Scan  Orders  More │
└─────────────────────────────────┘
```

---

## Header

The header is minimal. It's not a toolbar — it's a brand anchor.

```
┌─────────────────────────────────┐
│  Mike's Inventory         [BS]  │
└─────────────────────────────────┘
```

### Specs
- **Height:** 52px
- **Background:** `var(--bg-card)` (white/dark card)
- **Border bottom:** 1px solid `var(--border-color)`
- **Position:** sticky top, z-index 50
- **Padding:** 0 16px
- **Max-width:** 600px centered within

### Left: Brand
- **Text:** "Mike's Inventory"
- **Font:** 17px, weight 700, `var(--text-primary)`
- **Letter-spacing:** -0.025em
- **Clickable** → navigates to Home

### Right: User Avatar
- **Circle:** 32px diameter
- **Background:** `var(--primary)`
- **Text:** User's initials (white, 13px, weight 600)
- **Clickable** → opens settings popover (dark mode toggle + sign out)
- Replaces the gear icon — feels more personal, takes less space

### Settings Popover (from avatar click)
Small dropdown (not bottom sheet) with:
- User name + email (muted)
- Divider
- "Dark Mode" toggle row
- "Sign Out" (red text)

---

## Bottom Navigation

### Design Philosophy
5 tabs. Each has a 20px icon (stroke, not fill) and an 11px label. Active state uses filled icon + primary color. Inactive is `var(--slate-400)`.

### Tabs
| Position | Label | Icon | View | Notes |
|----------|-------|------|------|-------|
| 1 | Home | house | `home` | Dashboard |
| 2 | Items | grid-2x2 | `list` | Inventory list |
| 3 | Scan | scan-line (viewfinder) | `detect` | AI detect is primary |
| 4 | Orders | clipboard-list | `restock` | Restock/shopping list |
| 5 | More | menu (3 lines) | opens sheet | Secondary features |

### Visual Specs
- **Height:** 64px + safe-area-inset-bottom
- **Background:** `var(--bg-card)`
- **Border top:** 1px solid `var(--border-color)`
- **Box shadow:** `0 -1px 3px rgba(0,0,0,0.04)` (barely visible)
- **Icon size:** 22px (stroke width 1.5, not 2 — feels lighter)
- **Label size:** 11px, weight 500
- **Active color:** `var(--primary)` — navy, confident
- **Inactive color:** `var(--slate-400)`
- **Active indicator:** NO dot or bar underneath — the color shift is sufficient
- **Touch target:** Each tab is full width / 5, min 48px tall
- **Transition:** `color 0.15s ease`

### Orders Badge
- When restock list has items, show count badge
- **Position:** Top-right of icon area
- **Size:** 16px height, min-width 16px (auto for 2+ digits)
- **Background:** `var(--status-critical)` (red)
- **Text:** white, 10px, weight 700
- **Border:** 2px solid `var(--bg-card)` (creates separation)
- **Border-radius:** full

### More Menu (Bottom Sheet)

Opens from the "More" tab. Full-width bottom sheet with backdrop.

```
┌─────────────────────────────────┐
│                                 │ ← backdrop (tap to close)
│                                 │
├─────────────────────────────────┤
│ ── (handle bar) ──              │
│                                 │
│  📊  Quick Count                │
│  📷  Barcode Scan               │
│  🗑  Waste Log                  │
│  🏢  Suppliers                  │
│                                 │
│  ─────────────────              │
│                                 │
│  🌙  Dark Mode         [toggle] │
│  ↗   Sign Out                   │
│                                 │
└─────────────────────────────────┘
```

### More Menu Specs
- **Backdrop:** `rgba(0,0,0,0.3)`, z-index 200
- **Sheet background:** `var(--bg-card)`
- **Sheet border-radius:** 16px 16px 0 0
- **Padding:** 20px, bottom adds safe-area-inset
- **Handle bar:** 36px wide, 4px tall, `var(--slate-300)`, centered, 8px from top
- **Menu items:** 48px height, 16px padding horizontal, full width
  - Icon (20px, `var(--slate-500)`) + Label (15px, weight 500, `var(--text-primary)`)
  - Gap: 14px
  - Hover/active: `var(--bg-subtle)` background
  - Border-radius: 8px
- **Dark mode toggle:** Right-aligned toggle switch (not a full row button)
  - Track: 44px wide, 24px tall, `var(--slate-200)` (off) / `var(--primary)` (on)
  - Thumb: 20px circle, white, centered vertically
- **Sign out:** `var(--status-critical)` text and icon color
- **Divider:** 1px `var(--border-color)`, 8px vertical margin
- **Animation:** Sheet slides up 250ms with `ease-out`. Backdrop fades in 150ms.
- **Close:** Tap backdrop or tap "More" tab again

---

## Page Transitions

No page-level animations — they feel slow on mobile. Views swap instantly. The bottom nav provides spatial context.

Exception: The "More" bottom sheet gets a slide-up animation because it's an overlay, not a page change.

---

## App Container

```css
.app {
  max-width: 600px;        /* Tighter than 720px — more focused */
  margin: 0 auto;
  padding: 0 16px;
  padding-top: 52px;       /* Below fixed header */
  padding-bottom: 80px;    /* Below fixed bottom nav */
  min-height: 100vh;
}
```

### Responsive Behavior
- **< 600px (mobile):** Full width, 16px horizontal padding
- **>= 600px (tablet/desktop):** Centered, max 600px, natural margins appear
- No layout changes, no multi-column. This is a phone app that happens to work on desktop.

---

## Scroll Behavior

- `scroll-behavior: smooth` on html (for programmatic scrolls)
- `-webkit-overflow-scrolling: touch` on scrollable containers
- `overscroll-behavior: contain` on the app container (prevents pull-to-refresh interference)
