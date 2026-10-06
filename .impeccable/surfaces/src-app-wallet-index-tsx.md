---
version: 1
slug: "src-app-wallet-index-tsx"
primary_target: "src/app/(wallet)/index.tsx"
related_targets: []
---

## Scope and visitor mode

Scope: the whole PUNCH Android app — daily punch screen (lead surface), streak history, stake/pool, settings. Mode: Operate. The user is a habit-seeker opening the app once a day for seconds, often at low motivation, and must see the run, the risk, and the one action without reading.

## Audience, job, action, proof, constraints

Audience: solo people already keeping streaks who hold crypto. Job: punch in today and see what is at stake. Action: one tap. Proof: every number on screen resolves to a transaction the user can open — memo punches, SPL stake and slash transfers, devnet. Constraints: Android/Material, 48dp targets, system Back always works, light and dark both first-class, devnet cluster selectable, no custom on-chain program, SKR on mainnet with a devnet stand-in mint.

## Direction

TIME CLOCK — industrial enamel signage and machine load plate. Safety-yellow enamel carries live state on a graphite/steel ground; stencil condensed uppercase labels; a load-gauge dial where the streak number lives; an engraved plate for the wallet serial; hazard striping reserved for the unpaid day.

## Memorable moment

The needle sweeps and the hazard band unrolls across the screen the second before the user realises the day is unpaid — then the punch lands like a keycap and the band clears.

## Unresolved decisions

Typeface selection inside the stencil/condensed register (subject to what ships with the app). Whether the slash mechanic needs a second confirmation sheet on first use. Whether tablet is a target (currently phone only).

## Direction contract

### THESIS

The streak is a machine reading, not a badge. PUNCH shows a gauge under load and a hazard state when today is unpaid, and refuses the category default of a cheerful grid of rounded checkmark cards with a confetti animation.

### OWN-WORLD

Graphite/steel ground (#14161A dark, #F2F2EF light). Enamel safety yellow #FFC400 owns live state only — punch button, needle, at-risk band — and never becomes a page background. Hazard band is 45° yellow/black striping at 6px pitch. Labels are stencil condensed uppercase with wide tracking. The wallet sits on an engraved plate: inset panel, 1px top highlight, 1px bottom shade, monospace serial. The day grid draws its own construction lines as 1px hairlines — cells are visible structure, not gaps between cards. Panels are square-cornered with borders, not drop shadows. One mono face for all figures, tabular.

### STORY

Open: gauge reads the run, hazard band says the day is unpaid. Punch: the button depresses like a keycap, the transaction is signed through Mobile Wallet Adapter, the band clears and a notch stamps the card. History: the run reads as a barcode column of notches with the mono timestamps beside it. Stake: the plate shows what is bonded and what a miss pays out to everyone who punched today.

### FIRST VIEWPORT

Phone 390×844, dark ground. Top: engraved plate strip — mark left, truncated monospace address and cluster chip right. Centre: gauge arc with tick marks and needle above a display-size run number (~96px) reading `21` with unit `DAYS`; immediately beneath, the position/extent rail — `DAY 12 OF 30 · BEST 21` — as a ticked rail, always visible. Below that, either the hazard band (unpaid) or a flat enamel state plate (paid). Then the PUNCH control: full-width, 64px, enamel yellow, stencil label, square corners, keycap press state. Lower third: the seven-cell construction grid of the current week, hairline drawn. Bottom: three-destination Material navigation bar.

### FORM

Chosen form is candidate 6 of the grounded direction list, assigned by seed key `cf23221a`, mode operate.

### FINISH

unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
