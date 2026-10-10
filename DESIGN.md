---
name: Signal Hoist
description: Findings about illegal fishing, hoisted as International Code of Signals flags beside the live evidence that produced them.
colors:
  ground: "#f5f5f1"
  cloth: "#ffffff"
  ink: "#111318"
  ink-2: "#3b3f4a"
  ink-3: "#5f6571"
  rule: "#d6d7cf"
  rule-strong: "#b9bab0"
  flag-red: "#d42a2a"
  flag-blue: "#1747c4"
  flag-yellow: "#ffc61a"
  signal-gold: "#e3a008"
  series-other: "#9a9d96"
  seq-100: "#dbe4fa"
  seq-200: "#b3c6f2"
  seq-300: "#87a5e8"
  seq-400: "#5a82dc"
  seq-500: "#2f5fcf"
  seq-600: "#1747c4"
  seq-700: "#0f3392"
  seq-800: "#0a2366"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1rem + 5vw, 5.25rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.4rem + 3.4vw, 4rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 125"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  figure-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 100"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    fontVariation: "'wdth' 100"
  data:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 75"
  micro:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  cut: "2px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
  s-10: "144px"
components:
  chip:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.cut}"
    padding: "4px 12px"
    height: "32px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
    rounded: "{rounded.cut}"
  chip-hover:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
  nav-link:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.cut}"
    padding: "8px 12px"
    height: "44px"
  nav-link-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
  figure:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cut}"
  question-number:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.flag-yellow}"
    rounded: "{rounded.cut}"
    size: "64px"
  band-red:
    backgroundColor: "{colors.flag-red}"
    textColor: "{colors.cloth}"
    padding: "96px 32px 64px"
  band-blue:
    backgroundColor: "{colors.flag-blue}"
    textColor: "{colors.cloth}"
    padding: "96px 32px 64px"
  band-yellow:
    backgroundColor: "{colors.flag-yellow}"
    textColor: "{colors.ink}"
    padding: "96px 32px 64px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cloth}"
    rounded: "{rounded.cut}"
    padding: "8px 12px"
    width: "300px"
---

# Design System: Signal Hoist

## Overview

**Creative North Star: "The International Code of Signals"**

Every finding is a signal run up a halyard. The site borrows the one visual language the sea already uses to say "stop your vessel" or "negative" at a distance: flat flag cloth in signal red, blue, yellow, black and white, cut nearly square, each flag edged in the same even ink line. Verdicts are real code flags chosen for their meaning at sea, confidence is a row of numeral pennants, and each mini-challenge opens on a full field of its pennant colour with its suspects hoisted on a vertical halyard. It turns away from both the dark neon graph dashboard and the cream editorial report: the ground is sail-white, the ink is near-black, and colour arrives in large flat fields or as small, exact marks, never as glow or gradient.

Density follows the reader. Bands and the home hero are loud and spacious (96px vertical padding, display type at the expanded width), while the evidence beneath is a working instrument: white figure panels with ink borders, 12px chart text, chips that toggle state, and a table view behind every chart. Archivo's width axis carries the hierarchy: expanded (125) for display, normal (100) for reading, condensed (75) for numbers and identifiers.

Motion has one authored moment: the hoist, where flags rise into place on a slow, settling curve. Everything else is quick, quiet UI feedback.

**Key Characteristics:**
- Flat signal cloth; no gradients, no glow, no dark mode.
- One even 1.5px ink line edges flags, panels, controls and section breaks.
- Nearly square cut corners (2px) on every control and panel.
- Verdict and confidence are always a flag plus words, never colour alone.
- Claims sit beside their evidence and drive what the evidence shows.

## Colors

A sail-white ground and near-black ink, with the three signal cloths used at full saturation either as whole fields or as small, ink-edged marks.

### Primary
- **Signal Red** (flag-red): MC1's band field, the Suspect verdict, the active-section dot on the halyard, error emphasis, and the third categorical slot.
- **Signal Blue** (flag-blue): MC2's band field, the home mast, the focus ring, the Unlikely verdict, the first categorical slot, and the dark end of the sequential ramp.
- **Signal Yellow** (flag-yellow): MC3's band field, the claim highlighter, text selection, and the question-number numeral on ink. At page scale only; as a chart mark it is replaced by Signal Gold.

### Secondary
- **Signal Gold** (signal-gold): yellow as a data mark. It is the second categorical slot and the Possible verdict colour: a deeper yellow that holds up at mark scale and always carries an ink outline.

### Neutral
- **Sail White** (ground): the page, sticky header and halyard backgrounds, and the hover fill for unpressed chips and table rows.
- **Flag White** (cloth): raised panels (figures, the path strip, code chips) and text on red and blue fields. It is also the fifth categorical slot, used only as an ink-outlined fill.
- **Signal Ink** (ink): primary text, the one line, pressed and active controls, the tooltip, the footer field. It is also the fourth categorical slot (solid lines, outlined fills).
- **Ink 2** (ink-2): secondary text, prose body, ledes on white (9.6:1).
- **Ink 3** (ink-3): muted text, figure captions, prompts, all chart text, the Insufficient-evidence verdict (5.5:1).
- **Rule** (rule) and **Rule Strong** (rule-strong): hairline dividers, dashed chart gridlines, table row rules; axis lines.
- **Other** (series-other): the overflow category ("Other / unknown") in every categorical view.
- **Sequential Blue** (seq-100 to seq-800): the one sequential ramp, light to dark, for heatmaps and magnitudes.

### Named Rules
**The Signal Cloth Rule.** Categorical marks use only signal cloth, in a fixed order: blue, gold, red, black, white. Blue, gold and red are validated with the dataviz validator on the sail-white ground. Black and white never carry meaning by colour alone: their fills are ink-outlined, and as lines black is solid while slot 5 is drawn as dashed ink. Colour follows the entity, never its rank, and the order is never cycled.

**The Ink Edge Rule.** Every yellow or gold mark carries an ink outline, and every flag carries the same 1.5px ink edge, so yellow and white read on a white page.

**The Flag-Plus-Words Rule.** A verdict is never a colour swatch. It is the code flag (L Suspect, U Possible, X Insufficient evidence, N Unlikely) plus its label; confidence is three numeral pennants with the unhoisted ones muted, plus the word.

**The Full Field Rule.** Each mini-challenge band is a whole field of its pennant colour: MC1 red, MC2 blue, MC3 yellow. Text on red and blue is flag white (secondary text at 90% white); text on yellow is ink.

## Typography

**Display Font:** Archivo (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Archivo, same family
**Label/Mono Font:** Archivo at condensed width for data; ui-monospace for inline code only

**Character:** One grotesque, three widths. The expanded cut shouts like a painted hull name; the condensed cut packs figures and entity names into tight columns like a signal book.

### Hierarchy
- **Display** (800, fluid 2.5rem to 5.25rem, 0.92, uppercase, width 125): the home hero headline only.
- **Headline** (800, fluid 2.25rem to 4rem, 1.02, uppercase, width 125): band titles and the Method title, held to about 16 to 18 characters per line.
- **Title** (800, fluid 1.5rem to 2.25rem, 1.02, width 125): question titles (28ch max) and home section heads (uppercase there).
- **Figure title** (750, 1.0625rem, 1.25, width 100): states the finding a chart shows, 52ch max.
- **Body** (400, 1.0625rem, 1.55, width 100): prose at a 68ch measure; band and hero ledes step up to 1.1875 to 1.25rem.
- **Label** (600, 0.875rem): nav links, chips, selects, facts, figure subtitles.
- **Data** (800, condensed width 75, tabular figures): MC numbers, question numbers, entity names in hoists, numeric table cells, inline fact figures.
- **Micro** (0.75rem): figure captions, pennant labels, verdict-key meanings, halyard labels. Floor for any text in the system.

### Named Rules
**The Width Axis Rule.** Hierarchy moves along Archivo's width axis before it moves along size: expanded for display, normal for reading, condensed for numbers and names. Don't introduce a second family.

**The Chart Text Floor Rule.** Chart text is 12px, ink-3, tabular figures; emphasised labels step up to ink at weight 650. Nothing in a chart goes smaller.

## Layout

A spacing rhythm on base 4 (4, 8, 12, 16, 24, 32, 48, 64, 96, 144px) carries every gap and pad. Content tops out at 1240px for bands and Method, 1360px for the home sections, and 1440px for a challenge page.

A challenge page is an 88px halyard rail beside the content column. The rail is a sticky vertical rope with one flag per section; the section in view hangs in full colour with a red dot, the rest hang muted. Below 960px the rail becomes a sticky horizontal strip at the top with labels hidden.

Each question is a numbered head, a claim column and an evidence column. At 1280px and above the question splits into two columns: claim prose (up to 60ch) on the left, evidence on the right with a 48px gap. A short answer that fits the viewport pins (sticky, 104px from the top) so the claim stays beside its figures. Below 1280px the evidence stacks under the claim on a 12-column grid.

Bands split at 1100px: headline and lede on the left, the verdict hoist in a 320 to 400px right column. The home hero is a 1.2 : 1 split of copy and the blue mast, filling the first viewport, and stacks below 1100px. Phones use a 16px gutter; touch targets are at least 44px on coarse pointers.

## Elevation & Depth

The system is flat. Depth is drawn, not cast: an ink line separates surfaces, white cloth panels sit on sail-white ground, and full-colour bands stack edge to edge with an ink rule between them. The only cast shadow belongs to the floating tooltip. Selection rings inside charts and lists are inset ink lines, not shadows.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px rgb(17 19 24 / 0.08), 0 8px 24px -8px rgb(17 19 24 / 0.18)`): the tooltip only, the one surface that floats over content.

### Named Rules
**The Drawn Depth Rule.** Surfaces are separated by the 1.5px ink line or a cloth-on-ground step, never by a shadow. A cast shadow means the element floats above the page and follows the pointer.

## Shapes

Flags are cut cloth, so the form language is nearly square: every control and panel uses a 2px corner (chips, selects, nav links, figures, the question number, the tooltip, code chips, focus outlines). Borders are the one even line: 1.5px ink for flags, panels, controls and section breaks; 1px rule for hairline dividers inside a panel. Circles appear only where the sea uses them: the halyard's masthead ring and truck, the active-section dot, and the circle node shape. Flags themselves are drawn on a 60 x 45 grid, pennants on 90 x 36, and A and B keep their swallowtail.

Node-link views encode entity type by colour and shape together: company square, person circle, organization diamond, vessel triangle, location hexagon, other cross.

## Components

### Buttons and Chips
Square-cut, ink-edged toggles that read as state, not decoration.
- **Shape:** nearly square (2px), 1.5px ink border.
- **Chip:** flag white with ink label 600 at 0.875rem, 32px tall (44px on coarse pointers). Pressed is ink with white text. Used for every figure control and the "Show table" toggle.
- **Hover / Press:** hover fills sail-white, on fine pointers only. Press scales to 0.97 over 140ms.
- **Select:** the same border, radius and type as a chip, with room for the native arrow.

### Claim
Inline buttons inside claim prose that drive the evidence beside them.
- **Style:** ink text at 650 on a yellow highlighter stroke that sits under the baseline.
- **State:** pressed (and hover on fine pointers) floods the stroke to the full line height. Pressing a claim sets the linked figure's state; pressing again clears it.

### Figures
Every chart lives in one.
- **Corner Style:** 2px.
- **Background:** flag white on the sail-white page.
- **Border:** 1.5px ink; the caption is separated by a 1px rule.
- **Anatomy:** a title that states the finding, optional subtitle, controls row, legend, plot, and a caption naming the source data. Every figure with data has a table view behind a chip; the table has a sticky ink-ruled header and tabular, condensed numerals.
- **Internal Padding:** 16 to 24px.
- **States:** loading shows a small yellow flag running up a halyard with "Hoisting the evidence…"; error names what failed in plain words with the cause in red.

### Navigation
- **Header:** sticky on sail-white with an ink rule beneath. The wordmark is the L flag beside "Signal Hoist" in expanded uppercase 850.
- **Links:** each mini-challenge link carries its numeral pennant and a condensed "MC1/2/3". Default ink-2; hover (fine pointers) fills white; active is an ink field with white text and a yellow MC number. Under 860px, link labels hide and the row scrolls.
- **Halyard rail:** see Layout. Labels are small ink tags that slide in on hover or focus.

### Tooltip
- **Style:** ink field, white 0.875rem text, 2px corner, the one lift shadow, 300px max width, tabular rows.
- **Behaviour:** the first tip fades and scales in over 140ms; neighbouring tips then switch instantly.

### Verdict Hoist (signature)
The verdict list, strung on a vertical halyard in the band's right column (stacked under the lede on narrow screens). Each position hangs a 48px verdict flag from the rope and gives the entity name (condensed 800), a sentence of verdict plus pennants plus confidence, and a one-line reason. The rope and text take the band's own foreground; flags keep their ink edge on every field. The whole position is the hit area; the name opens the evidence. Positions rise in with the hoist keyframe, staggered 70ms. On hover the flag lifts 3px and the name underlines.

### Challenge Band (signature)
The opening of each mini-challenge: a full field of its pennant colour, the 64px numeral pennant, the uppercase headline, a lede, inline facts, and the Verdict Hoist beside it.

### Question Number
An ink square (64px, 48 x 40 on phones) with the condensed numeral in signal yellow, heading each question.

## Do's and Don'ts

### Do:
- **Do** draw every flag and panel edge with the one 1.5px ink line, and keep corners at 2px.
- **Do** pair every verdict with its code flag and its word, and every confidence with three numeral pennants and its word.
- **Do** keep categorical marks in the fixed order blue, gold, red, black, white, and outline every gold, black and white fill in ink; draw the fifth slot as a dashed ink line.
- **Do** give every figure a finding-stating title, a source caption and a table view.
- **Do** let claim buttons set figure state, and pin short answers beside their evidence at 1280px and up.
- **Do** keep UI motion between 140 and 200ms on the strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`), moving only transform and opacity; colour state changes may cross-fade over the same timing.
- **Do** reserve the hoist (640ms, `cubic-bezier(0.32, 0.72, 0, 1)`, a 48px rise with a fade, staggered) for flags arriving on a halyard.
- **Do** gate hover effects behind `(hover: hover) and (pointer: fine)`, and honour reduced motion by collapsing animations to an instant.
- **Do** keep chart text at 12px or larger in ink-3.

### Don't:
- **Don't** use gradients, glow, or a dark neon dashboard treatment; colour is flat cloth.
- **Don't** use flag yellow (#ffc61a) as a data mark; use signal gold with an ink outline.
- **Don't** let black or white carry a category by colour alone.
- **Don't** cast shadows on panels, cards or controls; only the floating tooltip lifts.
- **Don't** round corners past 2px on rectangular surfaces.
- **Don't** add a second typeface beyond monospace for inline code, or carry hierarchy with weight alone when the width axis can do it.
- **Don't** add a second authored animation; the hoist is the one moment.
