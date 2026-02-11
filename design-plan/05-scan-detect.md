# 05 — Scan & AI Detection

## Philosophy
This is Mike's secret weapon — the reason the app exists. AI-powered photo counting should feel like magic. Point, shoot, done. The camera UI should be as clean as a phone's native camera, and the results should be immediately useful.

## Primary View: AI Detect (Scan Tab)

The "Scan" tab in the bottom nav opens AI detection by default.

### States

1. **Ready** — Camera or upload prompt
2. **Capturing** — Camera viewfinder active
3. **Processing** — "Analyzing..." overlay
4. **Results** — Editable detection results
5. **Error** — Service unavailable

---

## State 1: Ready (Default)

```
┌─────────────────────────────────────┐
│  [Camera]  [Upload]                 │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │                                 │ │
│ │         (viewfinder SVG)        │ │
│ │                                 │ │
│ │     Point at a shelf or         │ │
│ │     cooler to count items       │ │
│ │                                 │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│        [ 📸 Capture & Count ]       │
│                                     │
└─────────────────────────────────────┘
```

### Mode Toggle
- Two tabs at top: "Camera" | "Upload"
- **Container:** flex, `var(--bg-subtle)` background, 6px padding, 8px border-radius
- **Tab (inactive):** transparent bg, `var(--text-secondary)`, 13px, weight 500
- **Tab (active):** `var(--bg-card)` bg, `var(--text-primary)`, weight 600, `var(--shadow-xs)`
- **Padding:** 8px 16px
- **Border-radius:** 6px
- **Margin-bottom:** 12px

### Camera Preview
- **Container:** `var(--slate-900)` background, 12px border-radius, overflow hidden
- **Aspect ratio:** 4:3 (natural for phone cameras)
- **Min-height:** 300px
- **Video element:** fills container, object-fit cover
- **Corner markers:** 4 corner brackets (L-shapes) in white with 40% opacity, positioned 16px from edges, 24px long, 2px wide. Subtle framing guide.

### Upload Mode (alternative)
Instead of camera preview, show:
- Dashed border: 2px dashed `var(--slate-300)`, 12px border-radius
- Min-height: 240px
- Center content:
  - Upload icon: 36px SVG, `var(--slate-400)`
  - "Tap to upload a photo" — 15px, weight 500, `var(--text-secondary)`
  - "JPEG, PNG, or HEIC" — 12px, weight 400, `var(--text-muted)`
- **Hover/tap:** border-color `var(--primary)`, icon color `var(--primary)`

### Capture Button
- **Text:** "Capture & Count" (camera mode) or "Upload & Count" (upload mode)
- **Style:** `btn-primary btn-full` (navy, full width)
- **Height:** 48px
- **Margin-top:** 12px
- **Icon:** Camera icon before text (16px)

### Flash Toggle (Camera Mode)
- **Position:** Absolute, top-right of camera preview (12px margin)
- **Size:** 40px circle
- **Background:** `rgba(0,0,0,0.5)`, backdrop-blur 4px
- **Icon:** Flash/lightning bolt SVG, 18px, white
- **Active (flash on):** Background `var(--status-warning)`

---

## State 2: Processing

Overlay on top of the captured/uploaded image.

```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │      (captured image)       │ │
│ │  ┌───────────────────────┐  │ │
│ │  │                       │  │ │
│ │  │   ⟳ Analyzing...     │  │ │
│ │  │   Counting items in   │  │ │
│ │  │   your photo          │  │ │
│ │  │                       │  │ │
│ │  └───────────────────────┘  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Overlay Specs
- **Background:** `rgba(15, 23, 42, 0.75)` (dark slate with transparency)
- **Backdrop-filter:** blur(2px)
- **Positioned:** Absolute over camera/image container
- **Content:** Centered flex column
  - Spinner: 24px, 2px stroke, `white`, rotating (use existing @keyframes spin)
  - "Analyzing..." — 15px, weight 600, white
  - "Counting items in your photo" — 13px, weight 400, `rgba(255,255,255,0.7)`
  - Gap between elements: 8px

---

## State 3: Results

```
┌─────────────────────────────────────┐
│  (thumbnail of analyzed image)      │
│                                     │
│  Found 8 items · 0.9s              │
│  ┌───────────┐ ┌───────────┐       │
│  │ 8 Items   │ │ 4 Types   │       │
│  └───────────┘ └───────────┘       │
│                                     │
│  ☑ Shredded Mozzarella       ×25   │
│     Dairy · high confidence         │
│                                     │
│  ☑ Sliced Pepperoni          ×12   │
│     Meat · high confidence          │
│                                     │
│  ☐ Unknown item (white, bag)  ×3   │
│     Uncategorized · needs review    │
│                                     │
│  [ Add 2 Items to Inventory ]       │
│  [ Retake Photo ]                   │
└─────────────────────────────────────┘
```

### Results Header
- **Summary text:** "Found {total} items · {processingTime}" — 15px, weight 600
- **Processing time:** `var(--text-muted)`, inline after items count

### Stats Row
- Two compact stat pills side by side
- **Background:** `var(--primary-50)`
- **Border-radius:** 8px
- **Padding:** 10px 14px
- **Value:** 16px, weight 700, `var(--primary)`
- **Label:** 12px, weight 500, `var(--text-secondary)`
- **Gap:** 8px between pills

### Detection Item Row

Each detected item is an editable card.

- **Container:** `var(--bg-card)`, 1px border, 12px border-radius, 14px padding
- **Margin-bottom:** 8px

**Row layout:**
```
[☑]  [Name input...........] [×qty]
     [Category select]  [confidence]
     [notes if present]
```

#### Checkbox
- 20px square, 4px border-radius
- Unchecked: 1.5px border `var(--slate-300)`, transparent
- Checked: `var(--primary)` fill, white checkmark
- Transition: `background 0.15s`
- Tapping toggles include/exclude from "Add to Inventory"

#### Name Input
- Flex: 1
- Inline editable — looks like text until focused
- **Default:** 14px, weight 600, `var(--text-primary)`
- **Focus:** 1.5px border `var(--primary)`, 6px border-radius, 4px padding
- No visible border when not focused (looks like plain text)

#### Quantity
- Right-aligned, 14px, weight 700, `var(--primary)`
- Prefix: "×" in `var(--text-muted)`
- Editable: tap to focus, 3rem width input
- Same inline-edit behavior as name

#### Category
- Small select dropdown, 12px font, weight 500
- `var(--text-secondary)` color
- Subtle border only on focus

#### Confidence Badge
- **High:** `var(--status-good-bg)` bg, `var(--status-good-text)` text
- **Medium:** `var(--status-warning-bg)` bg, `var(--status-warning-text)` text
- **Low:** `var(--status-critical-bg)` bg, `var(--status-critical-text)` text
- **Size:** 11px, weight 600, padding 2px 8px, border-radius full
- **Text:** "high" / "medium" / "low" (not "review needed")

#### Needs Review Flag
- If confidence is "low", show "Needs review" text
- 12px, weight 500, `var(--status-critical)`, italic
- Below the confidence badge

#### Grid Visualization (optional)
- Only show if user taps "Show grid" toggle
- Hidden by default — most users don't care about the counting grid
- 3x3 grid, 1px borders, small numbers in each cell

### Action Buttons
- **Primary:** "Add {count} Items to Inventory" — full width, navy
  - Count reflects only checked items
  - Disabled (opacity 0.5) if no items checked
- **Secondary:** "Retake Photo" — ghost button below
  - Resets to camera/upload ready state

---

## State 4: Service Unavailable

```
┌─────────────────────────────────┐
│                                 │
│      (cloud-off icon, 40px)     │
│                                 │
│   Detection service offline     │
│   The AI service is starting    │
│   up. This usually takes about  │
│   30 seconds.                   │
│                                 │
│   [ Try Again ]                 │
│                                 │
└─────────────────────────────────┘
```

- **Icon:** Cloud-off or wifi-off SVG, 40px, `var(--slate-300)`
- **Heading:** 16px, weight 600, `var(--text-primary)`
- **Body:** 14px, weight 400, `var(--text-secondary)`, max-width 260px, centered
- **Button:** "Try Again" — `btn-secondary`
- **No spinner** — user controls retry

---

## Barcode Scan (in More menu)

Barcode scanning is a secondary feature accessed from More menu. The view is simpler.

```
┌─────────────────────────────────┐
│  Barcode Scan                   │
│                                 │
│ ┌─────────────────────────────┐ │
│ │     (camera viewfinder)     │ │
│ │                             │ │
│ │      ─── scan line ───      │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│                                 │
│  Or enter barcode manually      │
│  [________________________]     │
│                                 │
│  ─── Recent Scans ───────────   │
│  Mozzarella · 25 lbs · OK      │
│  Pepperoni · 12 lbs · Low      │
│  Chicken · 18 lbs · OK         │
└─────────────────────────────────┘
```

### Header
- **Title:** "Barcode Scan" — 18px, weight 600
- No Add button — scanning IS the add action

### Scanner
- Start/Stop button: `btn-primary` "Start Scanner" / `btn-secondary` "Stop"
- Same camera container specs as AI detect
- Scan line: animated horizontal line, `var(--primary)` color, 2px height

### Manual Entry
- **Label:** "Or enter barcode manually" — 13px, weight 500, `var(--text-secondary)`
- **Input:** Standard text input, placeholder "Enter barcode..."
- **Submit:** On Enter key (no button needed)

### Recent Scans
- Same compact list style as dashboard recent activity
- Each row: Name · Qty Unit · Status badge
- Tappable → opens QuickUpdateModal
- Quick +/- buttons on right side

---

## No Results State (AI Detect)

When AI detect returns empty results:
```
┌─────────────────────────────────┐
│      (search icon, 40px)        │
│                                 │
│   No items detected             │
│   Try a closer photo with       │
│   better lighting, or add       │
│   items manually.               │
│                                 │
│   [ Retake ]  [ Add Manually ]  │
└─────────────────────────────────┘
```
