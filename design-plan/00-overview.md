# Mike's Inventory Manager — Design Overhaul

## The Problem
The app works. The app looks like a CS student's midterm project. Purple gradients, emoji-heavy navigation, inconsistent card treatments, generic copy, and a navigation structure that screams "I added features as I thought of them." The bones are solid — the UX flow is actually good — but the surface layer needs to match the quality of the product underneath.

## The Vision
**Toast POS meets Linear meets a well-designed food app.**

A tool that looks like a Series A startup built it. Professional enough for a restaurant owner to show their accountant, warm enough that a kitchen manager doesn't feel like they're using enterprise software. Every pixel earns its place.

## Design Principles

### 1. Kitchen-First
Everything is designed for a 5.5" screen held in one hand, possibly with wet or greasy fingers. Touch targets are generous (min 48px), text is legible at arm's length, and critical actions are reachable with a thumb. No hover-dependent interactions.

### 2. Clarity Over Cleverness
A restaurant owner who barely uses their phone beyond texting should understand every screen in 2 seconds. Labels are literal. Icons have text. Status is communicated through color AND text AND position — never just one channel.

### 3. Confident Restraint
Strong typography does the heavy lifting. Color is used with purpose — to communicate status, not to decorate. Whitespace isn't empty, it's structural. Every element has a reason to exist.

### 4. Warm Professional
Not cold SaaS gray. Not friendly consumer pastels. A warm slate palette with a confident blue, accented with kitchen-inspired warmth. The feeling is: "this was made by someone who understands restaurants."

### 5. Small Moments of Delight
Micro-interactions that feel responsive without being distracting. A progress bar that fills with satisfaction. A success state that feels earned. A number that ticks up when you add stock. Nothing gratuitous — just enough to make the tool feel alive.

## Brand Identity

**Name:** Mike's Inventory Manager (or just "Mike's" in the header)
**Personality:** Competent friend. The sous chef who has their shit together.
**Voice:** Direct, warm, specific. Not robotic, not cutesy.

### Copy Examples
- BAD: "No items found" → GOOD: "Nothing here yet — scan or add your first item"
- BAD: "Error occurred" → GOOD: "Couldn't save. Check your connection and try again."
- BAD: "Submit" → GOOD: "Save Count" or "Log Waste" (always specific)
- BAD: "Items" → GOOD: "24 items across 5 categories"
- BAD: "Low stock" → GOOD: "Running low — 3 days left at current pace"

## Technical Scope
- **Files modified:** `index.html`, `index.css`, `App.jsx`
- **No new dependencies** — everything is vanilla CSS + React
- **No backend changes** — purely cosmetic/UX
- **Dark mode:** Fully maintained with warm dark palette
- **Mobile-first, desktop-aware** — max-width 720px, centered

## File Index
| File | Contents |
|------|----------|
| `01-design-system.md` | Colors, typography, spacing, shadows, component tokens |
| `02-navigation-layout.md` | Bottom nav, header, page structure, transitions |
| `03-dashboard-home.md` | Dashboard redesign with stock health, quick actions |
| `04-inventory-list.md` | Inventory grid, filtering, item cards |
| `05-scan-detect.md` | AI detection page, barcode scan, camera UX |
| `06-quick-count.md` | Quick count flow redesign |
| `07-orders-suppliers.md` | Restock list and supplier management |
| `08-waste-tracking.md` | Waste logging and analytics |
| `09-modals-interactions.md` | Modal system, micro-interactions, toasts |
| `10-auth-onboarding.md` | Login/signup and first-time experience |
| `11-implementation-sequence.md` | Exact coding order, file-by-file |
