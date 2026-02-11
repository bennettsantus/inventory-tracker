# 09 — Modals & Micro-Interactions

## Modal System

### Design Philosophy
Modals are bottom sheets on mobile. They slide up from the bottom, have a handle bar for grab-ability, and never cover the full screen (always showing a sliver of backdrop). They feel native — like iOS/Android bottom sheets.

### Base Modal Specs

```
┌─────────────────────────────────┐
│         (dark backdrop)         │
│                                 │
├── ─────── (handle) ─────── ────┤
│ Title                       ✕  │
│─────────────────────────────────│
│                                 │
│  Content                        │
│                                 │
│                                 │
│  [Primary Action]               │
│                                 │
└─────────────────────────────────┘
```

#### Backdrop
- Background: `rgba(15, 23, 42, 0.4)` (slate-900 at 40%)
- Tap to close (always)
- **Animation:** Fade in 150ms ease-out

#### Sheet
- Background: `var(--bg-card)`
- Border-radius: 16px 16px 0 0
- Max-height: 92vh
- Width: 100%, max-width: 540px (centered on desktop)
- Overflow-y: auto (with smooth scrolling)
- Padding: 0 (sections handle their own padding)
- Padding-bottom: `env(safe-area-inset-bottom, 16px)`
- Box-shadow: `0 -4px 12px rgba(0, 0, 0, 0.08)`
- **Animation:** translateY(100%) → translateY(0), 250ms, ease-out

#### Handle Bar
- Width: 36px, height: 4px
- Background: `var(--slate-300)`
- Border-radius: full
- Centered horizontally
- Margin: 10px auto 0

#### Header
- Padding: 16px 20px
- Border-bottom: 1px solid `var(--border-color)`
- **Title:** 17px, weight 600, `var(--text-primary)`
- **Close button:** 32px circle, top-right
  - Background: `var(--bg-subtle)`
  - "✕" — 15px, weight 500, `var(--text-secondary)`
  - Hover: `var(--slate-200)`

#### Content
- Padding: 20px (horizontal + vertical)

#### Footer (for action buttons)
- Padding: 16px 20px
- Border-top: 1px solid `var(--border-color)`
- Background: `var(--bg-card)` (sticky within scroll)
- Flex: gap 10px

---

## QuickUpdateModal (Primary Item Interaction)

The most-used modal in the app. Opened by tapping any item anywhere.

```
┌── ─────────────────────── ─────┐
│ ── (handle) ──              ✕  │
│                                │
│ ┌─────────────────────────────┐│
│ │ 🥩  Italian Sausage        ││
│ │     Meat · Walk-in Cooler   ││
│ └─────────────────────────────┘│
│                                │
│  Current Stock                 │
│  ┌────────────────────────────┐│
│  │ 3 of 5 lbs          60%   ││
│  │ ▬▬▬▬▬▬▬▬▬▬░░░░░░░░       ││
│  │ ~0.5/day · 6 days left     ││
│  └────────────────────────────┘│
│                                │
│  Update                        │
│  ( Add/Remove ) ( Set Amount ) │
│  [−]  [  +2  ]  [+]           │
│  New total: 5 lbs              │
│                                │
│─────────────────────────────────│
│ [Edit Details] [Log Waste]     │
│                 [Update Stock] │
└─────────────────────────────────┘
```

### Item Header
- Background: `var(--bg-subtle)`
- Padding: 14px 16px
- Border-radius: 10px
- Margin-bottom: 16px
- **Icon:** Category emoji, 22px
- **Name:** 16px, weight 600, `var(--text-primary)`
- **Meta:** 13px, weight 400, `var(--text-secondary)`
  - Format: "{category} · {location}" or just "{category}"
  - If no category: show "Uncategorized" with a subtle "Assign?" link in `var(--primary)`

### Stock Summary
- Background: `var(--bg-subtle)`
- Padding: 14px 16px
- Border-radius: 10px
- Margin-bottom: 16px

**Row 1:** "Current Stock" label (12px, weight 600, `var(--text-secondary)`, uppercase, tracking)
**Row 2:** "{current} of {min} {unit}" — 16px, weight 700 | percentage — 14px, weight 600, status color
**Row 3:** Progress bar (4px height, status colored)
**Row 4:** Usage info (if available)
  - "~{avg}/day · {days} days left" — 12px, weight 500, `var(--text-secondary)`
  - Days remaining < 3: `var(--status-critical)`, weight 600

### Mode Toggle
- Same tab pattern as detect view Camera/Upload
- **"Add/Remove"** vs **"Set Amount"**
- Container: `var(--bg-subtle)`, 6px padding, 8px radius
- Margin-bottom: 12px

### Quantity Input
- Same stepper component
- **Add mode:** Shows "+2" / "-3" in input (with sign)
  - Allow negative values
- **Set mode:** Shows absolute value, placeholder is current quantity
- Below input: "New total: {calculated} {unit}" — 13px, weight 500, `var(--text-secondary)`
  - If change is large (≥10): show warning "That's a big change. Double-check?" in `var(--status-warning)`

### Footer Actions (3 buttons)
- **"Edit Details"** — ghost, `var(--text-secondary)`, left side
- **"Log Waste"** — ghost, `var(--status-critical)`, left side
- **"Update Stock"** — `btn-primary`, right side
  - Disabled if no change made (opacity 0.5)
  - Loading state while saving

---

## ItemModal (Add/Edit Item)

Full form for creating or editing an item.

### Form Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | text | Yes | Autofocus on create, 16px font |
| Category | select | No | Default "Uncategorized", with "+ New" option |
| Unit | select | No | Default "units" |
| Current Quantity | stepper | No | Default 0 |
| Low Stock Alert | number | No | "Alert me when below this" |
| Par Level | number | No | "Ideal stock level" |
| Cost per Unit | currency | No | "$" prefix |
| Storage Location | select | No | 5 options |
| Supplier | select | No | From supplier list |

### Form Layout
- Single column
- Each field: label (12px, weight 600, `var(--text-secondary)`, uppercase) + input
- Two-column for: Current Qty + Low Stock Alert (side by side)
- Two-column for: Par Level + Cost per Unit

### Barcode Field (if scanned)
- Show as a non-editable info line at top:
  - "Barcode: {code}" — 12px, `var(--text-muted)`, with copy icon

### Category "+ New" Flow
- Last option in select: "+ Add Category"
- On select: inline text input appears with "Add" button
- On add: category is created and selected

### Footer
- **Create mode:** "Add to Inventory" — `btn-primary btn-full`
- **Edit mode:** "Save Changes" — `btn-primary` | "Delete" — ghost, `var(--status-critical)`
  - Delete confirms: "Delete {name}? This removes the item and all its history."

---

## ThresholdEditModal

Simplified — this is a secondary action accessed from QuickUpdateModal.

### Content
- **Item info:** Name + category (compact, 1 line)
- **Current:** "{current} {unit}" — visual context
- **Slider + Input:**
  - Range: 0 to max(50, current * 2)
  - Input: 3rem width, centered number
  - Side by side
- **Status Preview:**
  - "With this threshold, {name} would be: {status}"
  - Show status badge (color + text)
- **Similar Items** (optional expand):
  - "Apply to similar items?" toggle
  - If expanded: checkboxes for same-category items

### Footer
- "Save Threshold" — `btn-primary`

---

## Toast Notifications

### Specs
- **Position:** Fixed top, centered, 16px from top
- **Background:** `var(--slate-900)` (dark on light mode, light on dark mode)
- **Text:** white (or dark text on light bg in dark mode), 14px, weight 500
- **Padding:** 12px 20px
- **Border-radius:** 10px
- **Box-shadow:** `var(--shadow-lg)`
- **Max-width:** 90vw, 400px
- **Z-index:** 2000

### Variants
- **Success:** Left accent: 3px `var(--status-good)`
  - Example: "Stock updated — Italian Sausage is now 5 lbs"
- **Error:** Left accent: 3px `var(--status-critical)`
  - Example: "Couldn't save. Check your connection."
- **Info:** Left accent: 3px `var(--primary)`
  - Example: "3 items added to inventory"

### Animation
- **Enter:** `translateY(-12px) → translateY(0)`, opacity `0 → 1`, 200ms ease-out
- **Exit:** `translateY(0) → translateY(-12px)`, opacity `1 → 0`, 150ms ease-in
- **Duration:** Auto-dismiss after 3 seconds

### Copy Guidelines
- Always mention the specific item/action: "Pepperoni updated to 12 lbs" not "Item updated"
- Keep under 50 characters when possible
- Use sentence case, no period at end

---

## Micro-Interactions

### Button Press
- `transform: scale(0.98)` on `:active`, 100ms
- Return to `scale(1)` on release, 100ms with ease-out
- No translateY — it shifts layout

### Card Tap
- `border-color` shifts to `var(--slate-300)` on hover (desktop)
- `transform: scale(0.99)` on `:active`, 80ms (mobile press feel)

### Progress Bar Fill
- `transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1)` — satisfying ease-out
- Used in: stock bars, count progress, quantity bars

### Number Transition
- When a number changes (stock count, stat value), it should NOT animate
- Instant swap is more honest for data. Animations on data values feel untrustworthy.

### Count Success Checkmark
- The green checkmark circle on Quick Count success:
  - Scale: 0 → 1.1 → 1, 300ms, cubic-bezier(0.34, 1.56, 0.64, 1) (spring)
  - Opacity: 0 → 1, 200ms

### Toggle Switch (Dark Mode)
- Track background transitions: 200ms ease
- Thumb position transitions: 200ms ease (translateX)
- Satisfying snap feel

### Bottom Sheet Entry
- Sheet: translateY(100%) → translateY(0), 250ms, ease-out
- Backdrop: opacity 0 → 1, 150ms, linear
- Combined: sheet slightly lags backdrop for layered effect
