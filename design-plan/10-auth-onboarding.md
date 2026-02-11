# 10 — Auth & Onboarding

## Auth Screen

### Philosophy
The auth screen is the first impression. It should communicate: "This is a professional tool made for restaurants." Not a generic login page. The design should be warm, confident, and fast.

### Layout

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│                                 │
│   ┌───────────────────────────┐ │
│   │                           │ │
│   │   Mike's Inventory        │ │
│   │   Sign in to manage       │ │
│   │   your restaurant.        │ │
│   │                           │ │
│   │   Email                   │ │
│   │   [___________________]   │ │
│   │                           │ │
│   │   Password                │ │
│   │   [___________________]   │ │
│   │                           │ │
│   │   [ Sign In ]             │ │
│   │                           │ │
│   │   Don't have an account?  │ │
│   │   Create one              │ │
│   │                           │ │
│   └───────────────────────────┘ │
│                                 │
│                                 │
└─────────────────────────────────┘
```

### Page Background
- `var(--slate-50)` — same as app background, no special treatment
- Vertically centered with flex

### Auth Card
- **Background:** `var(--bg-card)` (white)
- **Border:** 1px solid `var(--border-color)`
- **Border-radius:** 16px
- **Box-shadow:** `var(--shadow-lg)` — slightly elevated to feel like a focused element
- **Padding:** 32px 24px
- **Max-width:** 380px
- **Width:** calc(100% - 32px) (16px margins on mobile)

### Brand Header
- **"Mike's Inventory"** — 24px, weight 700, `var(--primary)`, tracking -0.025em
  - NOT a gradient text effect — solid navy. Gradients are over.
- **Subtitle (login):** "Sign in to manage your restaurant." — 14px, weight 400, `var(--text-secondary)`
- **Subtitle (signup):** "Create an account to get started." — same style
- **Margin-bottom:** 28px

### Form Fields
- Standard input style from design system
- **Labels:** 13px, weight 500, `var(--text-secondary)`, margin-bottom 6px
  - NOT uppercase — sentence case feels warmer
- **Inputs:** 44px height, 15px font
  - Placeholder text for context:
    - Email: "you@restaurant.com"
    - Password: "Min. 6 characters"
    - Name (signup): "Your name"
- **Field spacing:** 16px between fields

### Error Display
- Below the last field, above the button
- **Background:** `var(--status-critical-bg)`
- **Text:** 13px, weight 500, `var(--status-critical-text)`
- **Padding:** 10px 14px
- **Border-radius:** 8px
- **Border-left:** 3px solid `var(--status-critical)`
- **Margin:** 16px 0

### Submit Button
- Full width, `btn-primary btn-full`
- **Height:** 48px
- **Text (login):** "Sign In"
- **Text (signup):** "Create Account"
- **Loading state:** Spinner replacing text
  - Spinner: 20px, 2px white stroke
  - Button stays same size, no layout shift

### Mode Switch
- **Text:** "Don't have an account?" / "Already have an account?"
- **Link:** "Create one" / "Sign in" — `var(--primary)`, weight 600
- **Font:** 14px, weight 400, `var(--text-secondary)`
- **Margin-top:** 20px
- **Text-align:** center

---

## Dark Mode Auth
- Background: `var(--slate-50)` (which maps to dark bg in dark mode)
- Card: `var(--bg-card)` with subtle border
- Title: `var(--primary)` (brighter blue in dark mode)
- Inputs: `var(--bg-elevated)` background

---

## Loading State (App Init)

When the app first loads and checks auth token:

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│                                 │
│            (spinner)            │
│                                 │
│                                 │
│                                 │
└─────────────────────────────────┘
```

- Full viewport height
- Centered spinner: 32px, `var(--primary)`, 2px stroke
- Background: `var(--bg-primary)` (matches the app)
- No text — just the spinner. It's fast enough that text would flash.

---

## First-Time Experience (Post-Signup)

NOT implementing a full onboarding flow (that's feature work, not UI polish). But the empty states throughout the app serve as contextual onboarding:

1. **Dashboard empty:** "Let's get started." + two CTAs (Scan / Add manually)
2. **Inventory empty:** "Your inventory is empty" + Scan CTA
3. **Suppliers empty:** "No suppliers yet" + Add Supplier CTA

These are specified in their respective page docs. The key principle: every empty state tells the user WHAT to do next and gives them a single clear button to do it.

---

## Session Expiry

If a token expires mid-session (API returns 401):
- Silently redirect to auth screen
- Show toast: "Session expired. Please sign in again."
- Clear the stored token
- Don't lose their restock list (it's in localStorage)
