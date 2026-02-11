# 03 — Dashboard (Home)

## Philosophy
The dashboard answers one question: **"What do I need to deal with right now?"**

Not a data visualization tool. Not an analytics platform. A morning briefing. You open the app, scan the dashboard, and know what needs attention before the lunch rush.

## Layout (top to bottom)

```
┌─────────────────────────────────┐
│ Good morning.                   │
│ 3 items need your attention     │
│                                 │
│ ┌───────────┐ ┌───────────┐    │
│ │ 24        │ │ 3         │    │
│ │ Total     │ │ Low Stock │    │
│ └───────────┘ └───────────┘    │
│ ┌───────────┐ ┌───────────┐    │
│ │ 5         │ │ $2.4k     │    │
│ │ Order Soon│ │ On Hand   │    │
│ └───────────┘ └───────────┘    │
│                                 │
│ ─── Needs Attention ─────────── │
│ ┌─────────────────────────────┐ │
│ │ Italian Sausage      0 / 5 │ │
│ │ Out of stock — order today  │ │
│ ├─────────────────────────────┤ │
│ │ Fresh Basil           2 / 3│ │
│ │ ~1 day left at current pace │ │
│ └─────────────────────────────┘ │
│                                 │
│ ─── Recent Activity ──────────  │
│ ┌─────────────────────────────┐ │
│ │ Mozzarella  25  +3    2m   │ │
│ │ Pepperoni   12  —     5m   │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │  📊 Start Quick Count   →  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## Section 1: Greeting & Status Line

### Greeting
- **Text:** Time-based greeting
  - 5am-12pm: "Good morning."
  - 12pm-5pm: "Good afternoon."
  - 5pm-10pm: "Good evening."
  - 10pm-5am: "Working late."
- **Font:** 22px, weight 700, `var(--text-primary)`, tracking -0.025em
- **Margin bottom:** 4px

### Status Line
Dynamic summary that changes based on inventory state:
- **All good:** "Everything's stocked and ready."
- **Has low stock:** "3 items need your attention."
- **Has critical:** "2 items are out of stock."
- **No items yet:** "Let's get your inventory set up."
- **Font:** 15px, weight 400, `var(--text-secondary)`
- **Margin bottom:** 20px

---

## Section 2: Stats Grid (2x2)

Four cards in a 2-column grid. Each card is a tappable summary.

### Card Specs
- **Background:** `var(--bg-card)`
- **Border:** 1px solid `var(--border-color)`
- **Border-radius:** 12px
- **Padding:** 16px
- **Box-shadow:** `var(--shadow-card)`
- **Cursor:** pointer
- **Hover:** `border-color: var(--slate-300)` (subtle)
- **Active:** `transform: scale(0.98)` for 100ms

### Card Content
Each card has:
- **Value:** 28px, weight 700, leading 1
- **Label:** 12px, weight 500, `var(--text-secondary)`, tracking 0.025em
- **Accent:** 3px left border in status color

### Cards

| # | Value | Label | Left Border | Tap Action |
|---|-------|-------|-------------|------------|
| 1 | `{totalItems}` | "Total Items" | `var(--primary)` | → Items view (no filter) |
| 2 | `{lowStockItems.length}` | "Low Stock" | `var(--status-critical)` | → Items view (low filter) |
| 3 | `{mediumStockItems.length}` | "Order Soon" | `var(--status-warning)` | → Items view (medium filter) |
| 4 | `formatCurrency(totalValue)` | "On Hand" | `var(--status-good)` | No action (informational) |

**Conditional styling on "Low Stock" card:**
- If 0: value color is `var(--status-good)`, label says "All Stocked"
- If > 0: value color is `var(--status-critical)`

---

## Section 3: Needs Attention

Only shown if there are low-stock or critical items. This replaces the old "alert banner + alert cards" pattern with a cleaner list.

### Section Header
- **Text:** "Needs Attention"
- **Font:** 13px, weight 600, `var(--text-secondary)`, uppercase, tracking 0.05em
- **Margin:** 24px top, 12px bottom
- **Decoration:** Horizontal line extending to the right (flex with hr)

### Attention Item Card
A compact, information-dense card for each low-stock item. Sorted by urgency (days remaining, then severity).

```
┌─────────────────────────────────────────┐
│ 🥩 Italian Sausage (ground)    0 / 5   │
│    Out of stock — order today           │
│    ───────────────────── ▬▬░░░░░░░░ 0%  │
│    [Add to Order]        [Adjust Stock] │
└─────────────────────────────────────────┘
```

#### Specs
- **Background:** `var(--bg-card)`
- **Border:** 1px solid `var(--border-color)`
- **Border-left:** 3px solid status color (critical or warning)
- **Border-radius:** 12px
- **Padding:** 16px
- **Margin-bottom:** 8px

#### Content
- **Row 1:** Icon + Name (15px, weight 600) | Current / Min (15px, weight 700, right-aligned)
- **Row 2:** Status message (13px, weight 500, status color)
  - Out of stock: "Out of stock — order today" (critical)
  - 1 day left: "About 1 day left at current pace" (critical)
  - 2-3 days: "~2 days left — restock soon" (warning)
  - No usage data: "Below minimum ({current} of {min})" (warning)
- **Row 3:** Mini progress bar (4px height, full width, status colored fill)
- **Row 4:** Two ghost buttons
  - "Add to Order" (primary text color)
  - "Update Stock" (secondary text color)
  - Separated by flex, each `flex: 1`

### "All Clear" State
When no low-stock items exist:
```
┌─────────────────────────────────────────┐
│ ✓  Everything's well stocked.           │
│    No items below threshold right now.  │
└─────────────────────────────────────────┘
```
- **Border-left:** 3px solid `var(--status-good)`
- **✓ icon:** 20px, `var(--status-good)`
- **Text:** 15px weight 600 primary + 13px weight 400 secondary

---

## Section 4: Recent Activity

Compact feed of the last 6 inventory counts. Gives a sense of "what's been happening."

### Section Header
- **Text:** "Recent Activity"
- Same style as "Needs Attention" header

### Activity List
```
┌──────────────────────────────────────────┐
│  Shredded Mozzarella    25    +3    2m   │
│  Sliced Pepperoni       12     —    5m   │
│  Pizza Dough Balls      40    -2    1h   │
│  Fresh Basil             2     —    3h   │
└──────────────────────────────────────────┘
```

- **Container:** `var(--bg-card)`, 1px border, 12px radius, overflow hidden
- **Row height:** 44px
- **Row padding:** 0 14px
- **Row border-bottom:** 1px solid `var(--border-color)` (not last)
- **Columns:**
  - Name: flex 1, 13px, weight 500, `var(--text-primary)`, ellipsis
  - Count: 40px width, 13px, weight 600, `var(--text-primary)`, right-aligned
  - Variance: 40px width, 13px, weight 600, right-aligned
    - Positive: `var(--status-good)` with "+" prefix
    - Negative: `var(--status-critical)` with "−" prefix (proper minus sign)
    - Zero/none: "—" in `var(--text-muted)`
  - Time: 40px width, 12px, weight 400, `var(--text-muted)`, right-aligned

---

## Section 5: Quick Count CTA

Placed at the bottom — it's a secondary action, not the hero.

### Card Spec
- **Background:** `var(--bg-card)`
- **Border:** 1px solid `var(--border-color)`, dashed (subtle invitation to tap)
- **Border-radius:** 12px
- **Padding:** 16px
- **Display:** flex, align center, gap 12px
- **Cursor:** pointer
- **Hover:** background `var(--bg-subtle)`

### Content
- **Icon:** Clipboard icon (SVG, 20px, `var(--primary)`)
- **Text:** "Start Quick Count" — 15px, weight 600, `var(--primary)`
- **Arrow:** "→" — 15px, `var(--text-muted)`
- **Subtext:** "Count inventory by storage location" — 13px, weight 400, `var(--text-secondary)`, below the main text

---

## Empty Dashboard (No Items)

When the user has zero items in their inventory:

```
┌─────────────────────────────────┐
│                                 │
│         (clipboard icon)        │
│                                 │
│    Let's get started.           │
│    Add your first item by       │
│    scanning a photo or barcode. │
│                                 │
│    [  Scan Inventory  ]         │
│    [  Add Item Manually  ]      │
│                                 │
└─────────────────────────────────┘
```

- **Icon:** 48px SVG, `var(--slate-300)`, clipboard or box icon
- **Heading:** 18px, weight 600, `var(--text-primary)`
- **Body:** 15px, weight 400, `var(--text-secondary)`, max-width 280px, centered
- **Primary button:** "Scan Inventory" → navigates to detect view
- **Ghost button:** "Add Item Manually" → opens add item modal
- **Spacing:** 64px top padding, 16px between elements
