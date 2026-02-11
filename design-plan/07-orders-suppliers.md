# 07 — Orders & Suppliers

## Orders (Restock List)

### Philosophy
This is a shopping list, not an ERP system. Kitchen managers need to know: what to order, how much, and from whom. Make it feel like a checklist they can hand to a delivery driver.

### Page Layout

```
┌─────────────────────────────────┐
│ Orders                          │
│ 5 items to order                │
│                                 │
│ ┌─ Smart Fill ─────────────┐    │
│ │ Fill for [▼ 7 days]      │    │
│ │ Based on your usage data  │    │
│ │        [ Apply ]          │    │
│ └───────────────────────────┘    │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Italian Sausage (ground)    │ │
│ │ Current: 3 lbs · 0.5/day   │ │
│ │ [−] [  12  ] [+] lbs  [✕] │ │
│ ├─────────────────────────────┤ │
│ │ Fresh Basil                 │ │
│ │ Current: 2 bunches          │ │
│ │ [−] [   4  ] [+] bun  [✕] │ │
│ ├─────────────────────────────┤ │
│ │ ...                         │ │
│ └─────────────────────────────┘ │
│                                 │
│ ─── Summary ─────────────────   │
│  5 items · 34 total units       │
│  [ Clear List ]                 │
└─────────────────────────────────┘
```

### Page Header
- **"Orders"** — 22px, weight 700
- **Subtitle:** "{count} items to order" — 13px, weight 400, `var(--text-secondary)`

### Smart Fill Card
A helper that auto-calculates order quantities based on usage data.

- **Background:** `var(--primary-50)`
- **Border:** 1px solid `var(--primary)` at 20% opacity
- **Border-radius:** 12px
- **Padding:** 14px 16px
- **Margin-bottom:** 16px

**Content:**
- "Fill for" + dropdown: [3 days / 5 days / 7 days / 14 days]
  - Dropdown: inline select, 13px, weight 600, `var(--primary)`, underline
- "Based on your usage data" — 12px, `var(--text-secondary)`
- "Apply" button: `btn-sm btn-primary`, right-aligned

### Order Items

Items are listed in a single card container (no individual card per item — tighter layout for a list).

- **Container:** `var(--bg-card)`, 1px border, 12px radius, overflow hidden
- **Item row:**
  - Padding: 14px 16px
  - Border-bottom: 1px solid `var(--border-color)` (not last)
  - Flex column, gap 8px

#### Item Info
- **Name:** 14px, weight 600, `var(--text-primary)`
- **Meta:** 12px, weight 400, `var(--text-secondary)`
  - "Current: {qty} {unit}" + " · {avg}/day" if usage data exists
  - If smart suggestion available: "Suggested: {n}" in `var(--primary)`, weight 500

#### Quantity Controls
Horizontal row: [−] [input] [+] [unit] [remove]

- Same stepper as Quick Count but slightly smaller (36px height)
- **Remove button:** "✕"
  - 32px circle
  - `var(--slate-200)` bg
  - `var(--text-muted)` color
  - Hover: `var(--status-critical-bg)` bg, `var(--status-critical)` color
  - Right-aligned with margin-left auto

### Summary Footer
- **Background:** `var(--bg-subtle)`
- **Border-top:** 1px solid `var(--border-color)`
- **Padding:** 14px 16px
- **Text:** "{count} items · {totalUnits} total units" — 13px, weight 500, `var(--text-secondary)`
- **Clear List:** ghost button, `var(--status-critical)` color
  - Shows confirm on tap: "Clear all 5 items?" [Cancel] [Clear]

### Empty State
```
┌─────────────────────────────────┐
│                                 │
│      (clipboard icon, 40px)     │
│                                 │
│   No items to order             │
│   Items will appear here when   │
│   you add them from the low     │
│   stock alerts on Home.         │
│                                 │
│   [ Browse Low Stock ]          │
│                                 │
└─────────────────────────────────┘
```
- "Browse Low Stock" → navigates to Items view with 'low' filter

---

## Suppliers

### Philosophy
Supplier management is a secondary feature. Most restaurants have 2-5 suppliers. The UI should be minimal — a clean list with add/edit capability.

### Page Layout

```
┌─────────────────────────────────┐
│ Suppliers              [+ Add]  │
│ 3 suppliers                     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Sysco                       │ │
│ │ Tom Rivera · 555-100-2000   │ │
│ │ Main broadline distributor  │ │
│ ├─────────────────────────────┤ │
│ │ US Foods                    │ │
│ │ Linda Park · 555-200-3000   │ │
│ │ Backup, specialty items     │ │
│ ├─────────────────────────────┤ │
│ │ Local Farms Co-op           │ │
│ │ Jake Hernandez              │ │
│ │ Fresh produce Mon/Wed/Fri   │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Page Header
- **"Suppliers"** — 22px, weight 700
- **"+ Add"** — `btn-primary btn-sm`
- **Subtitle:** "{count} suppliers" — 13px, weight 400, `var(--text-secondary)`

### Supplier List
Single container card (like orders list).

- **Container:** `var(--bg-card)`, 1px border, 12px radius
- **Row:**
  - Padding: 14px 16px
  - Border-bottom: 1px solid `var(--border-color)` (not last)
  - Cursor: pointer (tap to edit)
  - Hover: `var(--bg-subtle)` background

#### Row Content
- **Name:** 15px, weight 600, `var(--text-primary)`
- **Contact line:** 13px, weight 400, `var(--text-secondary)`
  - Format: "{contact_name} · {phone}" or just "{contact_name}" or just "{phone}"
  - Email shown only if no phone
- **Notes:** 12px, weight 400, `var(--text-muted)`, 1 line max, ellipsis
  - Margin-top: 2px

### Supplier Modal (Add/Edit)
Standard modal (see `09-modals-interactions.md`) with form:

| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Name | text | Yes | "Supplier name" |
| Contact Name | text | No | "Contact person" |
| Phone | tel | No | "Phone number" |
| Email | email | No | "Email address" |
| Notes | textarea | No | "Delivery schedule, notes..." |

**Textarea:** 3 rows, resize vertical only

**Delete button:** Only in edit mode, bottom of form
- Ghost button: "Delete Supplier" in `var(--status-critical)`
- Shows confirm: "Delete {name}? This can't be undone." [Cancel] [Delete]

### Empty State
```
┌─────────────────────────────────┐
│                                 │
│      (people icon, 40px)        │
│                                 │
│   No suppliers yet              │
│   Add suppliers to track who    │
│   delivers what.                │
│                                 │
│   [ Add First Supplier ]        │
│                                 │
└─────────────────────────────────┘
```
