# 06 — Quick Count

## Philosophy
Quick Count is the "daily ritual" feature — the thing kitchen managers do every morning and evening. It should feel like checking off a list, not operating software. Fast, rhythmic, satisfying.

## Flow
1. **Choose location** → 2. **Count items** → 3. **Review & submit** → 4. **Done**

---

## Screen 1: Location Picker

```
┌─────────────────────────────────┐
│  Quick Count                    │
│  Pick a location to start       │
│                                 │
│  ┌──────────┐ ┌──────────┐     │
│  │    🧊    │ │    ❄️    │     │
│  │ Walk-in  │ │ Freezer  │     │
│  │ 12 items │ │  5 items │     │
│  └──────────┘ └──────────┘     │
│  ┌──────────┐ ┌──────────┐     │
│  │    📦    │ │    🥤    │     │
│  │   Dry    │ │   Bar    │     │
│  │ 7 items  │ │ 4 items  │     │
│  └──────────┘ └──────────┘     │
│  ┌──────────────────────┐       │
│  │    🔪  Prep Area     │       │
│  │       4 items        │       │
│  └──────────────────────┘       │
└─────────────────────────────────┘
```

### Title
- **"Quick Count"** — 22px, weight 700, `var(--text-primary)`
- **"Pick a location to start"** — 14px, weight 400, `var(--text-secondary)`
- Margin bottom: 20px

### Location Cards
- **Grid:** 2 columns, 10px gap
- **5th item (Prep Area):** spans full width (1 column centered or full width)
- **Card specs:**
  - Background: `var(--bg-card)`
  - Border: 1.5px solid `var(--border-color)`
  - Border-radius: 12px
  - Padding: 20px 16px
  - Text-align: center
  - Cursor: pointer
  - Min-height: 100px
  - **Hover:** border-color `var(--primary)`, background `var(--primary-50)`
  - **Active:** `transform: scale(0.97)`, 100ms
  - **Transition:** `border-color 0.15s, background 0.15s`
- **Icon:** 28px, margin-bottom 6px
- **Label:** 14px, weight 600, `var(--text-primary)`
- **Count:** 12px, weight 400, `var(--text-secondary)`
  - "12 items" / "No items" (if 0, card is dimmed with opacity 0.5, not clickable)

---

## Screen 2: Count Entry

```
┌─────────────────────────────────┐
│ ← Walk-in Cooler    4 of 12    │
│ ▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░ 33%    │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Shredded Mozzarella         │ │
│ │ Last count: 25 lbs          │ │
│ │ [-]  [  25  ]  [+]   lbs   │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Sliced Provolone     ✓     │ │
│ │ Last count: 8 lbs           │ │
│ │ [-]  [   8  ]  [+]   lbs   │ │
│ └─────────────────────────────┘ │
│                                 │
│ ...more items...                │
│                                 │
│ ┌─────────────────────────────┐ │
│ │     Save 4 Counts           │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Header Bar
- **Back button:** "←" icon + location name
  - "← Walk-in Cooler"
  - 15px, weight 600, `var(--primary)`
  - Tappable: returns to location picker
  - Icon: chevron-left SVG, 16px
- **Progress:** Right-aligned
  - "4 of 12" — 13px, weight 500, `var(--text-secondary)`

### Progress Bar
- Below header, full width
- **Height:** 4px (thinner than current — less visual noise)
- **Background:** `var(--slate-200)`
- **Fill:** `var(--primary)`, width = counted/total * 100%
- **Border-radius:** 2px
- **Transition:** `width 0.3s ease-out`
- **Margin-bottom:** 16px

### Item Cards

Each item in the location gets a count card.

```
┌──────────────────────────────────────┐
│ Shredded Mozzarella            ✓    │
│ Last: 25 lbs                        │
│ [−]  [  25  ]  [+]          lbs    │
│                        + Add note   │
└──────────────────────────────────────┘
```

#### Specs
- **Background:** `var(--bg-card)`
- **Border:** 1.5px solid `var(--border-color)`
- **Border-radius:** 12px
- **Padding:** 14px 16px
- **Margin-bottom:** 8px
- **Counted state:** border-color `var(--status-good-border)`, subtle `var(--status-good-bg)` tint
- **Checkmark:** appears in top-right when value differs from blank (i.e., user has entered/confirmed)
  - 16px, `var(--status-good)`, weight 700

#### Item Name
- 14px, weight 600, `var(--text-primary)`
- Single line, ellipsis overflow

#### Last Count
- 12px, weight 400, `var(--text-secondary)`
- "Last: {qty} {unit}" or "No previous count" if first time

#### Quantity Input Group
Horizontal: [−] [input] [+] [unit label]

- **Minus button:**
  - 40px × 40px
  - `var(--bg-subtle)` bg
  - 1.5px border `var(--border-color)`
  - Border-radius: 8px 0 0 8px
  - "−" character, 18px, weight 600, `var(--text-primary)`
  - Active: `var(--slate-200)` bg
- **Input:**
  - 64px width, 40px height
  - Text-center
  - 16px, weight 700, `var(--text-primary)`
  - Border: 1.5px solid `var(--border-color)` (top/bottom only)
  - No border-radius
  - Background: `var(--bg-card)`
  - Focus: border-color `var(--primary)`, box-shadow `0 0 0 2px var(--primary-50)`
- **Plus button:**
  - Mirror of minus, border-radius: 0 8px 8px 0
- **Unit label:**
  - Right of plus button, 12px margin-left
  - 12px, weight 500, `var(--text-muted)`
  - 32px min-width

#### Add Note Toggle
- "Add note" — 12px, weight 500, `var(--primary)`, cursor pointer
- Appears below input group
- On tap: slides open a text input (120ms)
  - Single-line input, 13px, placeholder "Note about this count..."
  - 1px border, 6px border-radius
  - Slide animation: max-height 0 → 36px, opacity 0 → 1

### Sticky Submit Bar
- **Position:** fixed bottom, above bottom nav
  - `bottom: calc(64px + env(safe-area-inset-bottom, 0))`
- **Background:** `var(--bg-card)`
- **Border-top:** 1px solid `var(--border-color)`
- **Padding:** 12px 16px
- **Z-index:** 90 (below nav at 100)

#### Submit Button
- Full width, `btn-primary`
- **Text:** "Save {count} Counts" (e.g., "Save 4 Counts")
- **Disabled state:** If no items have been touched
  - Opacity 0.5, cursor default
- **Loading state:** Spinner replaces text, same button size
- Height: 48px

---

## Screen 3: Success

```
┌─────────────────────────────────┐
│                                 │
│           ✓                     │
│    12 Counts Saved              │
│    Walk-in Cooler               │
│                                 │
│  ─── Variances ──────────────   │
│  Italian Sausage        −2      │
│  Fresh Basil            +1      │
│  Heavy Cream             —      │
│                                 │
│  [ Count Another Location ]     │
│                                 │
└─────────────────────────────────┘
```

### Success Icon
- **Circle:** 56px, `var(--status-good)` background
- **Checkmark:** white, 24px, weight bold
- **Animation:** Scale from 0 → 1 with spring easing (0.3s)

### Title
- **"{count} Counts Saved"** — 20px, weight 700, `var(--text-primary)`
- **"{location name}"** — 14px, weight 400, `var(--text-secondary)`

### Variance Summary
Only shown if there are variances (count ≠ previous value).

- **Section header:** "Variances" — 12px, weight 600, uppercase, `var(--text-secondary)`, tracking 0.05em
- **Table:**
  - Background: `var(--bg-card)`, 1px border, 12px radius
  - Row: 40px height, 14px horizontal padding
  - Name: 13px, weight 500, `var(--text-primary)`, flex 1
  - Variance: 13px, weight 700
    - Positive: `var(--status-good)`, "+{n}" prefix
    - Negative: `var(--status-critical)`, "−{n}" prefix
    - Zero: "—" in `var(--text-muted)`

### CTA
- "Count Another Location" — `btn-secondary btn-full`
- Returns to location picker
- 16px margin-top
