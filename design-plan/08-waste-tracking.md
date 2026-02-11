# 08 — Waste Tracking

## Philosophy
Waste tracking exists to answer: "How much money are we throwing away, and why?" The logging should be fast (10 seconds to log waste), and the analytics should be glanceable (3-second scan to understand trends).

## Waste Log Entry (Modal)

Opened from QuickUpdateModal → "Log Waste" button, or from item details.

### Modal Layout

```
┌─────────────────────────────────┐
│ Log Waste                    ✕  │
│ Italian Sausage (ground)        │
│ Current stock: 3 lbs            │
│─────────────────────────────────│
│                                 │
│ How much?                       │
│ [−]  [  2  ]  [+]   lbs        │
│                                 │
│ Why?                            │
│ ┌──────────┐ ┌──────────┐      │
│ │📅 Expired│ │🦠 Spoiled│      │
│ ├──────────┤ ├──────────┤      │
│ │💔 Damaged│ │🍳 Over-  │      │
│ │          │ │   prepped│      │
│ ├──────────┤ ├──────────┤      │
│ │💧 Spilled│ │📝 Other  │      │
│ └──────────┘ └──────────┘      │
│                                 │
│ Cost per unit (optional)        │
│ $ [  5.75  ]                    │
│ Estimated loss: $11.50          │
│                                 │
│ Notes (optional)                │
│ [______________________]        │
│                                 │
│ [      Log Waste       ]        │
└─────────────────────────────────┘
```

### Header
- **"Log Waste"** — modal title
- **Item name** — 14px, weight 600, `var(--text-primary)`, below title
- **Current stock** — 13px, weight 400, `var(--text-secondary)`

### Quantity Input
- Same stepper component as Quick Count / Orders
- **Label:** "How much?" — 13px, weight 600, `var(--text-secondary)`, uppercase, tracking 0.03em
- **Warning:** If quantity > current stock, show:
  - "That's more than what's in stock" — 12px, `var(--status-warning)`, italic
  - Below the input group

### Reason Grid
- **Label:** "Why?" — same style as quantity label
- **Grid:** 2 columns, 8px gap
- **Reason button:**
  - Background: `var(--bg-card)`
  - Border: 1.5px solid `var(--border-color)`
  - Border-radius: 10px
  - Padding: 12px
  - Text-align: center
  - Cursor: pointer
  - **Selected state:**
    - Border: 1.5px solid `var(--primary)`
    - Background: `var(--primary-50)`
  - **Transition:** `border-color 0.15s, background 0.15s`
- **Icon:** 18px, block, margin-bottom 4px
- **Label:** 13px, weight 500, `var(--text-primary)`

### Cost Input
- **Label:** "Cost per unit (optional)"
- **Input group:** "$" prefix (14px, weight 600, `var(--text-secondary)`) + number input
- **Estimated loss:** Below input
  - "Estimated loss: ${amount}" — 13px, weight 600, `var(--status-critical)`
  - Only shown if both quantity and cost are filled

### Notes
- **Label:** "Notes (optional)"
- **Input:** Single-line text, placeholder "What happened?"

### Submit Button
- Full width, `btn-primary`
- **Text:** "Log Waste" (not "Submit" — specific verbs)
- **Disabled:** If quantity ≤ 0 or no reason selected
- **Loading:** Spinner state while saving

---

## Waste Report Page

Accessed from More menu → "Waste Log"

### Page Layout

```
┌─────────────────────────────────┐
│ Waste                           │
│ [7d] [14d] [30d] [90d]         │
│                                 │
│  ┌────────┐┌────────┐┌────────┐ │
│  │   12   ││  18    ││ $94    │ │
│  │ Events ││ Units  ││ Lost   │ │
│  └────────┘└────────┘└────────┘ │
│                                 │
│ ─── By Reason ───────────────   │
│ 📅 Expired     ▬▬▬▬▬▬░░  8     │
│ 🦠 Spoiled     ▬▬▬░░░░░  4     │
│ 🍳 Over-prep   ▬▬░░░░░░  3     │
│ 💧 Spilled     ▬░░░░░░░  2     │
│ 📝 Other       ▬░░░░░░░  1     │
│                                 │
│ ─── Most Wasted ─────────────   │
│ 1. Italian Sausage   6 lbs $35 │
│ 2. Fresh Basil       4 bun $10 │
│ 3. Heavy Cream       3 qts  $9 │
│                                 │
│ ─── Recent ──────────────────   │
│ 📅 Italian Sausage   2 lbs     │
│    Expired · 2 hours ago  $12  │
│ 🦠 Fresh Basil       1 bun     │
│    Spoiled · yesterday    $3   │
│                                 │
└─────────────────────────────────┘
```

### Header
- **"Waste"** — 22px, weight 700
- **Period selector:** Horizontal pills (same pattern as inventory filter tabs)
  - Options: 7d / 14d / 30d / 90d
  - Default: 30d
  - Active pill: `var(--primary)` bg, white text
  - Inactive: transparent bg, border, `var(--text-secondary)`

### Summary Cards (3 across)
- **Grid:** 3 equal columns, 8px gap
- **Card:**
  - Background: `var(--bg-card)`
  - Border: 1px solid `var(--border-color)`
  - Border-radius: 10px
  - Padding: 12px 8px
  - Text-align: center
- **Value:** 22px, weight 700
  - Events count: `var(--text-primary)`
  - Units total: `var(--text-primary)`
  - Cost: `var(--status-critical)` (red — this is money lost)
- **Label:** 11px, weight 500, `var(--text-muted)`

### By Reason Breakdown

- **Section header:** "By Reason" (standard section header style)
- **Container:** `var(--bg-card)`, 1px border, 12px radius, 14px padding
- **Row per reason:**
  - Height: 36px
  - Flex: icon (18px, 28px width) | name (80px, 13px, weight 500) | bar (flex 1) | count (36px, right-aligned, 13px, weight 600)
  - **Bar:** 8px height, `var(--slate-200)` bg, fill is `var(--status-critical)` at opacity 0.7
    - Width proportional to max count
    - Border-radius: 4px
  - **Margin-bottom:** 6px between rows

### Most Wasted Items
- **Section header:** "Most Wasted"
- **Container:** `var(--bg-card)`, 1px border, 12px radius
- **Row:**
  - Padding: 12px 14px
  - Border-bottom: 1px solid `var(--border-color)` (not last)
  - Flex: rank (20px, 13px, weight 700, `var(--text-muted)`) | name (flex 1, 13px, weight 600) | qty+cost (right, 13px)
  - Qty: weight 600, `var(--text-primary)`
  - Cost: weight 500, `var(--status-critical)`, 12px
- **Tap:** Opens item's QuickUpdateModal
- **Limit:** Top 5 items

### Recent Waste Log
- **Section header:** "Recent"
- **Container:** `var(--bg-card)`, 1px border, 12px radius
- **Row:**
  - Padding: 12px 14px
  - Border-bottom: 1px (not last)
  - **Line 1:** Icon + Item name + quantity — 13px, weight 600
  - **Line 2:** Reason + " · " + time ago — 12px, weight 400, `var(--text-muted)`
  - **Right:** Cost if available — 13px, weight 600, `var(--status-critical)`

### Empty State
```
┌─────────────────────────────────┐
│                                 │
│      (trash icon, 40px)         │
│                                 │
│   No waste logged yet           │
│   Start tracking waste from     │
│   item details to see trends    │
│   and reduce losses.            │
│                                 │
└─────────────────────────────────┘
```
- No CTA button — waste logging happens contextually from items, not from this page
