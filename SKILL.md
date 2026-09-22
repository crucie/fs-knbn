---
name: apple-design-language
description: Apply Apple Human Interface Guidelines when designing or building UI — spacing/padding systems, typography, color, materials, motion, and taste. Use for app screens, web UIs, dashboards, or any interface that should feel native, calm, and considered rather than generic.
---

# Apple Design Language

Approach this the way a designer on Apple's Human Interface team would: clarity first, content over chrome, and every pixel doing a job. The three governing principles behind all of this are **Clarity** (legible text, precise icons, purposeful negative space), **Deference** (the UI's job is to serve content, not compete with it), and **Depth** (layers and motion convey hierarchy and give the interface a sense of place). Every decision below traces back to one of these three.

## Spacing, padding, and the grid

Apple's layouts are built on an 8pt base unit (with 4pt half-steps for tight spots). Don't invent arbitrary spacing values — pick from the scale and stay consistent:

- **Base scale:** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- **Standard screen margins:** 16pt on compact/mobile widths, 20pt is also common on iOS; 24–32pt on larger tablet/desktop canvases. Never let content touch the edge.
- **Padding inside containers:** cards, sheets, and grouped list rows typically use 16pt internal padding; compact rows (list items, table cells) use 12pt vertical / 16pt horizontal.
- **Section spacing:** group related elements with the smallest gap in the scale that still separates them (8–12pt); separate unrelated sections with a clearly larger gap (24–32pt+). The *relative* jump between "related" and "unrelated" spacing should be obvious at a glance — if every gap looks the same, hierarchy is lost.
- **Touch targets:** minimum 44×44pt for anything tappable, even if the visible glyph is smaller — pad invisibly rather than enlarging the icon.
- **Safe areas:** always respect safe-area insets on notches, home indicators, and rounded corners; never anchor critical content or controls flush to a physical edge.
- **Alignment:** establish a single consistent left (or leading) edge for text and controls per screen/section. Apple layouts rarely center body content — centering is reserved for short, symbolic moments (empty states, onboarding, alerts).

## Typography

- Default to the system font stack (SF Pro on Apple platforms; on the web, `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif`, or a similarly humanist, neutral grotesque if the brief calls for something distinct). The type itself should be quiet — hierarchy comes from size, weight, and spacing, not from picking an attention-getting face.
- Use a restrained type scale with clear steps, roughly: 34/28 (large title), 22/20 (title), 17 (body — the iOS default and a good baseline for readability), 15 (subhead/secondary), 13 (caption/footnote). Line-height around 1.2–1.3 for headings, 1.4–1.5 for body.
- Lean on **weight** (regular / medium / semibold / bold) before color or size to create emphasis. Avoid using more than 2–3 weights on one screen.
- Support Dynamic Type equivalents where the platform allows it: never hard-code pixel sizes that can't scale, and test that layouts don't break at larger text sizes.
- Sentence case throughout — labels, buttons, headers. Avoid tracked-out all-caps eyebrows; if a label needs distinguishing, use weight or a subdued color, not case.

## Color

- Build on **semantic** roles, not literal hex values sprinkled everywhere: a primary label color, secondary/tertiary label colors (for de-emphasized text), a system background, a grouped/secondary background (for cards sitting on the base), a separator color, and one accent (tint) color used sparingly for interactive elements and state.
- Design for both light and dark appearance from the start — don't treat dark mode as an inverted afterthought. Dark surfaces should still have layered elevation (slightly lighter grays for raised surfaces, not pure black stacked on pure black).
- The accent/tint color should appear only where something is actionable or selected (buttons, links, active tab, toggles) — not decoratively on backgrounds or headings. One accent per experience; resist adding a second "brand" color unless the brief explicitly wants distinct visual identity over platform neutrality.
- Contrast matters more than saturation: favor legible, slightly desaturated system-like palettes over vivid gradients as a default.

## Materials, depth, and elevation

- Convey hierarchy with **layering**, not heavy drop shadows or borders. A raised surface gets a subtly lighter (or darker, in dark mode) fill and, at most, a very soft shadow — never a hard outline plus a shadow plus a gradient stacked together.
- Use translucency/blur ("materials") for surfaces that float above content — navigation bars, sheets, tab bars, tooltips — so what's beneath remains contextually visible. Reserve fully opaque surfaces for the base layer and primary content.
- Corner radii should feel continuous and soft (Apple's "squircle" superellipse rather than a plain CSS border-radius on sharp geometry) — larger radii (16–20pt+) on cards and sheets, smaller (8–10pt) on compact controls and buttons, and radii should scale with the size of the element, not be one fixed value applied everywhere.
- Depth is also implied through motion (see below), not only static shadow.

## Motion

- Motion should be **physical and springy**, not linear-eased. Prefer spring/ease-out curves that overshoot slightly and settle, mimicking real-world inertia.
- Motion must be purposeful: it should clarify where something came from or where it's going (a sheet rises from the bottom it will return to; a detail view pushes in from the direction its list item sat). Never animate purely for decoration.
- Keep it brief — most transitions land in the 200–400ms range. Respect reduced-motion settings by falling back to a simple cross-fade.
- One orchestrated moment per screen at most (a hero reveal, a satisfying confirmation state) — not hover/reveal animation on every element.

## Iconography and controls

- Icons should match the weight and optical size of adjacent text (a regular-weight label pairs with a regular-weight icon, not a heavy filled glyph). Keep a single icon family/style throughout — don't mix outlined and filled sets.
- Controls (buttons, switches, segmented controls, sliders) should look like refinements of the platform's native controls, even in a web context — rounded, tactile, with clear pressed/selected states — rather than flat custom shapes invented per project.
- Buttons: one clear primary action per screen (filled, tinted), secondary actions as plain/tinted text or outlined — avoid multiple competing filled buttons.

## Taste and restraint

- Every element must justify its presence. If removing a divider, label, icon, or shadow doesn't lose information, remove it — whitespace is doing the organizing work, not lines and boxes.
- Avoid generic "AI-generated UI" tells: identical rounded cards for everything regardless of hierarchy, one soft grey shadow under every element, gradient washes as pure decoration, tracked-out all-caps eyebrows, middle-dot-joined meta text, arrows appended to every button label. Apple's own interfaces almost never do these.
- Content leads. Chrome (navigation, dividers, labels) should recede; the user's actual content (photos, text, data) should be the most visually prominent thing on screen.
- When a brief specifies a distinct brand identity, follow the brief's colors/type over strict Apple defaults — but keep Apple's *structural* discipline (spacing scale, hierarchy through weight/size, restrained materials, purposeful motion) underneath it.

## Process

1. **Read the content first.** Identify what the actual primary content/task is before laying out chrome around it.
2. **Set the token system** before writing code: spacing scale, type scale, semantic color roles (light + dark), corner-radius scale, one accent color.
3. **Build in layers**: base background → grouped/card surfaces → floating/translucent elements (nav, sheets) → foreground content and controls.
4. **Self-critique**: check spacing against the 8pt scale, check that only one accent color and one primary action are present, check light/dark parity, check touch target sizes, and remove anything decorative that doesn't carry information.
