# 04 — Inventory List

## Philosophy
This is the workhorse page. Kitchen managers open this 10x a day. It needs to load fast, scroll smooth, and surface the right information at a glance. No friction.

## Layout

```
┌─────────────────────────────────┐
│ Items                   [+ Add] │
│ 24 items · 5 categories         │
│                                 │
│ [All] [Low Stock] [By Category] │
│                                 │
│ ─ Low Stock (3) ──────────────  │
│ ┌─────────────────────────────┐ │
│ │ 🥩 Italian Sausage   0/5 ▬ │ │
│ │ 🌿 Fresh Basil       2/3 ▬ │ │
│ │ 🧀 Ranch Dressing    1/1 ▬ │ │
│ └─────────────────────────────┘ │
│                                 │
│ ─ Getting Low (5) ────────────  │
│ ┌─────────────────────────────┐ │
│ │ ...                         │ │
│ └─────────────────────────────┘ │
│                                 │
│ ─ Well Stocked (16) ──────────  │
│ ┌─────────────────────────────┐ │
│ │ ...                         │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## Page Header

### Title Row
- **"Items"** — 22px, weight 700, `var(--text-primary)`
- **"+ Add"** button — right-aligned, `btn-primary btn-sm` (navy)
  - Text: "+ Add" (not "+ Add Item" — screen space is precious)
  - On tap: opens ItemModal in create mode

### Subtitle
- **Text:** `"{totalItems} items · {categoryCount} categories"` or `"{totalItems} items"` if 1 category
- **Font:** 13px, weight 400, `var(--text-secondary)`
- **Margin bottom:** 16px

---

## Filter Tabs

Horizontal row of filter pills. Not a dropdown — pills are faster to tap and show all options at once.

### Tabs
| Label | Filter | Count shown |
|-------|--------|-------------|
| "All" | `null` | total items |
| "Low Stock" | `'low'` | critical count |
| "Order Soon" | `'medium'` | warning count |
| "By Category" | `'category'` | switches to category view |

### Tab Specs
- **Container:** flex, gap 8px, margin-bottom 16px
- **Tab (inactive):**
  - Background: transparent
  - Border: 1.5px solid `var(--border-color)`
  - Color: `var(--text-secondary)`
  - Font: 13px, weight 500
  - Padding: 6px 14px
  - Border-radius: full (pill shape)
- **Tab (active):**
  - Background: `var(--primary)`
  - Border: 1.5px solid `var(--primary)`
  - Color: white
  - Font: weight 600
- **Count badge:** Inside tab, after label
  - Example: "Low Stock 3"
  - The count is part of the label text, not a separate badge
  - Only show count if > 0
- **Transition:** `background 0.15s, border-color 0.15s, color 0.15s`

---

## Default View: By Stock Status

When "All" is selected, group items by stock status. This surfaces urgency naturally.

### Section Headers
- **Format:** "Low Stock (3)" / "Getting Low (5)" / "Well Stocked (16)"
- **Font:** 12px, weight 600, uppercase, `var(--text-secondary)`, tracking 0.05em
- **Left accent:** 3px tall, 16px wide bar in status color, inline before text
- **Margin:** 20px top, 8px bottom

### Item Card

```
┌──────────────────────────────────────────┐
│ 🥩  Italian Sausage (ground)       0/5  │
│     Meat · Out of stock        ▬▬░░░ 0% │
└──────────────────────────────────────────┘
```

#### Specs
- **Background:** `var(--bg-card)`
- **Border:** 1px solid `var(--border-color)`
- **Border-radius:** 12px
- **Padding:** 14px 16px
- **Margin-bottom:** 6px
- **Cursor:** pointer
- **Hover:** `border-color: var(--slate-300)`
- **Active:** `transform: scale(0.99)` for 100ms (subtle press)
- **Transition:** `border-color 0.15s ease`

#### Left Side
- **Icon:** Category emoji, 24px, width 28px (fixed), flex-shrink 0
- **Name:** 15px, weight 600, `var(--text-primary)`, ellipsis overflow
  - Max 1 line on mobile
- **Meta:** 12px, weight 400, `var(--text-secondary)`
  - Format: `"{category} · {statusText}"`
  - Status text uses status color, rest is secondary

#### Right Side
- **Quantity:** 15px, weight 700, `var(--text-primary)`
  - Format: `"{current}/{min}"` (e.g., "3/5")
  - If no min set: just show `"{current}"`
  - Color: status color for low/medium items
- **Mini progress bar:** Below quantity
  - Width: 48px
  - Height: 3px
  - Background: `var(--slate-200)`
  - Fill: status colored, width = `min(100, (current/min)*100)%`
  - Border-radius: full
  - Only shown if min_quantity > 0

### Status Text Logic
| Condition | Text | Color |
|-----------|------|-------|
| current = 0 | "Out of stock" | critical |
| daysRemaining ≤ 1 | "~1 day left" | critical |
| daysRemaining ≤ 3 | "~{n} days left" | warning |
| current ≤ min | "Running low" | critical |
| current ≤ min * 1.5 | "Getting low" | warning |
| current > min * 1.5 | "In stock" | good (but don't show — it's noise) |
| no min set | "No threshold" | muted |

**Rule:** For "Well Stocked" section, OMIT the status text entirely. "In stock" adds no information. The category alone is sufficient for items that don't need attention.

---

## Category View

When "By Category" is selected, group items by category instead of stock status.

### Section Headers
- Same style as status sections
- **Format:** `"{emoji} {Category} ({count})"`
- **Accent bar:** `var(--primary)` instead of status color

### Item Cards
Same card design, but meta line omits category (redundant since they're grouped).
- **Meta:** `"{current}/{min} {unit} · {statusText}"`
- Only show statusText if the item isn't well-stocked

---

## Search (Future Enhancement)

**NOT implementing now**, but leaving room for a search bar between the header and filter tabs. The layout should accommodate a 44px search input being inserted without breaking.

---

## Empty States

### No Items At All
```
┌─────────────────────────────────┐
│                                 │
│         (box icon, 40px)        │
│                                 │
│    Your inventory is empty      │
│    Scan a photo or add items    │
│    manually to get started.     │
│                                 │
│    [  Scan Inventory  ]         │
│                                 │
└─────────────────────────────────┘
```

### Filtered With No Results
```
┌─────────────────────────────────┐
│                                 │
│         (check icon, 40px)      │
│                                 │
│    No low stock items           │
│    Everything is above          │
│    threshold right now.         │
│                                 │
└─────────────────────────────────┘
```

- Center aligned, 48px top padding
- Icon: SVG, 40px, `var(--slate-300)`
- Heading: 16px, weight 600, `var(--text-primary)`
- Body: 14px, weight 400, `var(--text-secondary)`, max-width 260px centered

---

## Tap Behavior

Tapping any item card opens the **QuickUpdateModal** (see `09-modals-interactions.md`). The modal is the primary interaction point for individual items.
