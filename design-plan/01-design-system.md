# 01 — Design System

## Color Palette

### Philosophy
Cold grays feel like a hospital. Pure grays feel like a wireframe. We use **warm slates** — grays with a subtle blue undertone that feel professional without feeling clinical. Status colors are saturated enough to read across a steamy kitchen but not so neon they look like a video game.

### Primary Brand
```
--primary:        #1e3a5f    /* Deep navy — confident, trustworthy, reads as "professional tool" */
--primary-hover:  #152d4a    /* Darker on press */
--primary-light:  #e8f0fe    /* Tinted backgrounds, selected states */
--primary-50:     #f0f5ff    /* Barely-there tint for subtle highlights */
--accent:         #f97316    /* Warm orange — kitchen energy, used VERY sparingly */
--accent-light:   #fff7ed    /* Orange tint for accent backgrounds */
```

**Why navy instead of bright blue?** Bright blue (#2563eb) is the "default React app" color. Navy reads as intentional, mature, and pairs beautifully with warm accents. It's the color of a chef's apron, not a loading spinner.

### Status Colors
```
--status-critical:        #dc2626    /* Red — urgent, out of stock */
--status-critical-bg:     #fef2f2
--status-critical-border: #fecaca
--status-critical-text:   #991b1b    /* Darker for text on light bg */

--status-warning:         #d97706    /* Amber — not orange, warmer than yellow */
--status-warning-bg:      #fffbeb
--status-warning-border:  #fde68a
--status-warning-text:    #92400e

--status-good:            #059669    /* Emerald — not lime green, feels earned */
--status-good-bg:         #ecfdf5
--status-good-border:     #a7f3d0
--status-good-text:       #065f46
```

### Neutral Palette (Warm Slate)
```
--slate-50:   #f8fafc    /* Page background */
--slate-100:  #f1f5f9    /* Card hover, input bg, subtle sections */
--slate-200:  #e2e8f0    /* Borders, dividers */
--slate-300:  #cbd5e1    /* Disabled borders, muted elements */
--slate-400:  #94a3b8    /* Placeholder text, disabled text */
--slate-500:  #64748b    /* Secondary text, labels */
--slate-600:  #475569    /* Body text alternative */
--slate-700:  #334155    /* Strong secondary text */
--slate-800:  #1e293b    /* Primary text */
--slate-900:  #0f172a    /* Headings, emphasis */
```

### Semantic Mapping
```
--bg-primary:     var(--slate-50)
--bg-card:        #ffffff
--bg-elevated:    #ffffff
--bg-subtle:      var(--slate-100)    /* NEW: for section backgrounds */
--text-primary:   var(--slate-900)
--text-secondary: var(--slate-500)
--text-muted:     var(--slate-400)
--border-color:   var(--slate-200)
--border-strong:  var(--slate-300)
```

### Dark Mode Palette
```
--slate-50:   #0f172a    /* Page background — very dark blue-gray, not pure black */
--slate-100:  #1e293b    /* Card backgrounds */
--slate-200:  #334155    /* Borders */
--slate-300:  #475569    /* Stronger borders */
--slate-400:  #64748b    /* Muted text */
--slate-500:  #94a3b8    /* Secondary text */
--slate-600:  #cbd5e1    /* Body text */
--slate-700:  #e2e8f0    /* Strong text */
--slate-800:  #f1f5f9    /* Primary text */
--slate-900:  #f8fafc    /* Headings */

--primary:        #3b82f6    /* Brighter blue for dark mode contrast */
--primary-hover:  #60a5fa
--primary-light:  #1e3a5f
--primary-50:     #172554

--accent:         #fb923c
--accent-light:   #1c1410

--bg-card:        #1e293b
--bg-elevated:    #334155
--bg-subtle:      #0f172a

/* Status colors brighten in dark mode for readability */
--status-critical:        #f87171
--status-critical-bg:     #1f1215
--status-critical-border: #7f1d1d
--status-warning:         #fbbf24
--status-warning-bg:      #1c1a0f
--status-warning-border:  #78350f
--status-good:            #34d399
--status-good-bg:         #0f1f1a
--status-good-border:     #064e3b
```

---

## Typography

### Font Stack
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Inter stays — it's excellent for UI. But we'll use it with more intention.

### Type Scale
```
--text-xs:    0.75rem     /* 12px — timestamps, badges, fine print */
--text-sm:    0.8125rem   /* 13px — meta text, labels */
--text-base:  0.9375rem   /* 15px — body text (NOT 16px — slightly tighter for data-dense UI) */
--text-md:    1rem         /* 16px — form inputs, prominent body */
--text-lg:    1.125rem    /* 18px — section headers, card titles */
--text-xl:    1.375rem    /* 22px — page titles */
--text-2xl:   1.75rem     /* 28px — hero numbers (stat values) */
--text-3xl:   2.25rem     /* 36px — dashboard big numbers */
```

### Weight Usage
| Weight | Token | Usage |
|--------|-------|-------|
| 400 | `regular` | Body text, descriptions, notes |
| 500 | `medium` | Labels, secondary headings, nav items, metadata |
| 600 | `semibold` | Button text, card titles, active nav, form labels |
| 700 | `bold` | Page titles, stat values, emphasis |

**Rule:** Never use 800 (extra-bold). It looks like shouting. 700 is strong enough.

### Letter Spacing
```
--tracking-tight:  -0.025em   /* Headings, large text */
--tracking-normal: -0.011em   /* Body text */
--tracking-wide:   0.025em    /* Small uppercase labels */
```

### Line Heights
```
--leading-none:    1          /* Big numbers, single-line elements */
--leading-tight:   1.25       /* Headings */
--leading-snug:    1.375      /* Cards, compact text */
--leading-normal:  1.5        /* Body text */
```

---

## Spacing Scale

```
--space-1:   0.25rem    /* 4px  — tight inner spacing */
--space-2:   0.5rem     /* 8px  — icon gaps, tight padding */
--space-3:   0.75rem    /* 12px — standard gap, card inner padding */
--space-4:   1rem       /* 16px — section padding, standard margin */
--space-5:   1.25rem    /* 20px — card padding */
--space-6:   1.5rem     /* 24px — section spacing */
--space-8:   2rem       /* 32px — major section breaks */
--space-10:  2.5rem     /* 40px — page top padding */
--space-12:  3rem       /* 48px — hero spacing */
```

**Rule:** Use the scale. Don't invent values like `13px` or `22px` for spacing.

---

## Shadows

```
--shadow-xs:  0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-sm:  0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
--shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06);  /* Default card shadow */
```

**Philosophy:** Shadows should be nearly invisible. They create separation through depth, not decoration. If you can see the shadow clearly, it's too strong.

### Dark Mode Shadows
Replace rgba values with slightly higher opacity and add a subtle top highlight:
```
--shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03);
```

---

## Border Radius

```
--radius-sm:   6px     /* Badges, small chips */
--radius-md:   8px     /* Buttons, inputs, small cards */
--radius-lg:   12px    /* Cards, modals, major containers */
--radius-xl:   16px    /* Bottom sheets, auth container */
--radius-full: 9999px  /* Pills, circular elements */
```

**Rule:** Consistency matters more than size. Cards are always 12px. Buttons are always 8px. Don't mix.

---

## Component Tokens

### Cards
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
```
No hover transforms. Clickable cards get `cursor: pointer` and a subtle border-color change on hover.

### Inputs
```css
input, select, textarea {
  padding: 10px 12px;
  font-size: var(--text-md);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: border-color 0.15s ease;
}

input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-50);
}
```

### Buttons
```css
/* Base */
.btn {
  padding: 10px 20px;
  font-size: var(--text-base);
  font-weight: 600;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
  min-height: 44px;
}

/* Primary — navy, not electric blue */
.btn-primary {
  background: var(--primary);
  color: white;
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:active { background: var(--primary-hover); transform: scale(0.98); }

/* Ghost — text button with no background */
.btn-ghost {
  background: transparent;
  color: var(--primary);
  padding: 10px 12px;
}
.btn-ghost:hover { background: var(--primary-50); }
```

### Touch Targets
Minimum 44px height for all interactive elements. On mobile, prefer 48px. Spacing between tappable elements: minimum 8px.

---

## Transitions

```
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1)     /* For elements entering */
--ease-in:     cubic-bezier(0.55, 0.06, 0.68, 0.19)  /* For elements leaving */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)  /* For micro-interactions */

--duration-fast:   100ms
--duration-normal: 150ms
--duration-slow:   250ms
```

**Rule:** Only transition `opacity`, `transform`, `background`, `border-color`, `color`, and `box-shadow`. Never transition `all` — it causes layout jank.
