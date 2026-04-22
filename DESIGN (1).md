# Design System Documentation: Precision & Paper

## 1. Overview & Creative North Star
**The Creative North Star: "The Architectural Atelier"**

The print industry is a marriage of industrial precision and tactile artistry. This design system moves away from the "generic SaaS" look to embrace a high-end, editorial aesthetic that mirrors the quality of a premium print shop. We are not just building an ERP; we are building a digital workspace that feels as curated as a lithographic portfolio.

By utilizing **intentional asymmetry**, **exaggerated white space**, and **tonal layering**, we break the rigid "box-on-box" layout typical of data-heavy tools. The interface should feel light, airy, and authoritative, favoring "breathing room" over dense clutter to reduce cognitive load for print shop operators.

---

## 2. Colors & Surface Philosophy

Our palette is anchored by a deep Indigo (`primary`), balanced by functional status colors and a sophisticated Slate Gray (`secondary`) for utility surfaces.

### The "No-Line" Rule
Standard 1px borders are largely prohibited for sectioning. Instead, we define boundaries through **Background Color Shifts**. A section should be distinguished by moving from `surface` to `surface-container-low`. This creates a softer, more premium transition that feels integrated rather than partitioned.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine paper.
- **Base Layer:** `surface` (#f8f9ff)
- **Nested Sections:** `surface-container-low` (#eff4ff)
- **Interactive Cards:** `surface-container-lowest` (#ffffff)
- **Elevated Modals:** `surface-container-highest` (#d3e4fe) with a subtle backdrop blur.

### The "Glass & Gradient" Rule
To add visual "soul," use subtle gradients on primary actions. Instead of a flat Indigo, use a linear gradient from `primary` (#3525cd) to `primary_container` (#4f46e5). For floating top bars or sidebars, apply **Glassmorphism**: a semi-transparent `surface` color with a `24px` backdrop-blur to allow content to ghost through as it scrolls.

---

## 3. Typography: Editorial Authority

We use a dual-font strategy to balance character with legibility.

*   **Display & Headlines (Manrope):** Use Manrope for all large headers and KPI numbers. Its geometric nature feels modern and "designed."
*   **Body & Data (Inter):** Use Inter for all functional text, tables, and labels. Its high x-height ensures readability for complex print job specifications.

**Hierarchy Highlights:**
- **Display-LG (3.5rem):** Reserved for dashboard hero stats (e.g., Monthly Revenue).
- **Title-SM (1rem):** The default for table headers and form labels, using `on_surface_variant` (#464555) for a sophisticated, low-contrast look.
- **Label-SM (0.6875rem):** All caps with 0.05em letter-spacing for status badges.

---

## 4. Elevation & Depth

We convey importance through **Tonal Layering** and **Ambient Light** rather than structural lines.

*   **The Layering Principle:** Place a `surface-container-lowest` (pure white) card on top of a `surface-container-low` background. This creates a natural "lift" that mimics a sheet of paper on a desk.
*   **Ambient Shadows:** For floating elements (like user menus), use a shadow: `0 20px 40px rgba(11, 28, 48, 0.06)`. The tint uses `on_surface` to keep the shadow feeling like a natural obstruction of light.
*   **The "Ghost Border" Fallback:** Where a border is required for clarity (e.g., input fields), use the `outline_variant` (#c7c4d8) at **20% opacity**. Never use 100% opaque borders.

---

## 5. Components

### Sidebar & Navigation
- **Width:** 240px fixed.
- **Style:** Uses `secondary` (#515f74) with a slight translucency. Active states should not use a box; instead, use a vertical "ink-stroke" (2px line) in `primary` on the far left and a subtle `surface_variant` background shift.

### Tables (The Data Grid)
- **Striping:** Forbid divider lines. Use `surface-container-low` for even rows. 
- **Hover:** Active rows shift to `surface-container-high` (#dce9ff) with a `primary` colored text shift for the ID column.
- **Locale Formatting:** All currency must follow Argentine locale: `$ 1.250,00`. Dates: `24/05/2024`.

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), `xl` (0.75rem) corner radius.
- **Secondary:** Transparent fill with a `Ghost Border` and `primary` text.
- **States:** On hover, increase the gradient intensity; on press, scale the button to 98%.

### Status Badges (Pills)
- Use `full` (9999px) rounding.
- **Success:** Emerald background at 15% opacity with dark emerald text.
- **Danger:** `error_container` background with `on_error_container` text.
- No borders. The color should "glow" from the surface.

### Input Fields
- Avoid the "boxed" look. Use a `surface-container-low` background with a bottom-only `Ghost Border`. When focused, the border transforms into a 2px `primary` line.

---

## 6. Do's and Don'ts

### Do
- **DO** use the Spacing Scale (8px increments) religiously to create "Gallery" style layouts.
- **DO** use `surface-container-lowest` for the main content area to make it pop against the `surface` background.
- **DO** align numbers to the right in all tables to ensure the Argentine decimal commas align vertically.

### Don't
- **DON'T** use 100% black text. Always use `on_surface` (#0b1c30) for better optical comfort.
- **DON'T** use traditional dividers (`<hr>`). Use a 32px vertical gap or a subtle background color change instead.
- **DON'T** use sharp corners. Every element should have a minimum of a `md` (0.375rem) radius to feel approachable and modern.