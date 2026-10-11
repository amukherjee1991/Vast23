---
name: Signal Hoist
description: Night sea. Findings about illegal fishing told as scroll stories on a dark sea, where the light comes only from the data and the verdict lamps.
colors:
  abyss: "#050c14"
  ground: "#07111b"
  cloth: "#0c1926"
  swell: "#12243a"
  ink: "#e7eff6"
  ink-2: "#a8bccc"
  ink-3: "#7d95a8"
  rule: "#1a2d40"
  rule-strong: "#2a4157"
  moon: "#d6e4ff"
  series-1: "#17a99c"
  series-2: "#c4880c"
  series-3: "#e04870"
  series-4: "#5a80f0"
  series-5: "#e7eff6"
  series-other: "#4f6578"
  lit-1: "#5ff2e2"
  lit-2: "#ffc95a"
  lit-3: "#ff7a9a"
  lit-4: "#9cb6ff"
  verdict-suspect: "#e04870"
  verdict-possible: "#c4880c"
  verdict-insufficient: "#7d95a8"
  verdict-unlikely: "#5a80f0"
  flag-red: "#d6322f"
  flag-blue: "#2152d1"
  flag-yellow: "#ffc61a"
  flag-black: "#0a0f16"
  flag-white: "#f4f7fb"
  flag-edge: "#c7d4e4"
typography:
  display:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(3.25rem, 1.6rem + 5.4vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.96
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(2.5rem, 1.6rem + 2vw, 3.75rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.018em"
  headline-act:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(2rem, 1.3rem + 2.2vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.012em"
  takeaway:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(1.75rem, 1.15rem + 2.3vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(1.375rem, 1.15rem + 0.7vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1.15
  subtitle:
    fontFamily: "Bodoni Moda, Didot, Bodoni 72, Georgia, serif"
    fontSize: "clamp(1.125rem, 1rem + 0.6vw, 1.5rem)"
    fontWeight: 500
    lineHeight: 1.3
  stage-label:
    fontFamily: "Bodoni Moda, Didot, Georgia, serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.2
  lede:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label-strong:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.35
  small:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  readout:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "clamp(1.5rem, 1.1rem + 1.2vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  hair: "2px"
  sm: "4px"
  md: "8px"
  pill: "999px"
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
  gutter: "clamp(16px, 4vw, 64px)"
  act: "clamp(72px, 12vh, 144px)"
  hit: "44px"
  rail: "64px"
components:
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
    height: "32px"
  chip-pressed:
    backgroundColor: "{colors.swell}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
    height: "40px"
  nav-link-active:
    backgroundColor: "{colors.swell}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  bridge-next:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "0 14px 0 18px"
    height: "44px"
  bridge-next-hover:
    backgroundColor: "{colors.swell}"
  claim:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
    padding: "0 1px"
  select:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.sm}"
    padding: "4px 28px 4px 12px"
    height: "32px"
  tooltip:
    backgroundColor: "{colors.cloth}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    width: "300px"
  step:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    padding: "8px 0 8px 24px"
---

# Design System: Signal Hoist

## Overview

**Creative North Star: "The Night Sea"**

Illegal fishing happens after dark, and the evidence is read the same way. The page is abyssal water. Every finding is a light on it: thousands of entities drawn as additive glow on canvas stages, verdicts hoisted as International Code of Signals flags that act as lamps. The visualization is the page, so there are no boxed reports and no dashboard panels. Each challenge is a chapter told on a full-height sticky stage, text steps scroll past and drive it, and every claim in the prose lights its own evidence.

The system holds to the craft of the user's VAST22 site but has its own identity. Story typography is a high-contrast Didone, Bodoni Moda, set like chart lettering. The interface runs in Archivo and measurements in JetBrains Mono. The chrome (header, rail, controls, figure furniture) stays quiet: hairlines, moonlight text, no glow. Light is reserved for data that stands for light and for the signal lamps. Density is low on the page and high on the stage. The prose column stays narrow and calm, and the stage beside it is crowded with marks.

The world refuses two things: the boxed report (cards, framed figures, panel grids) and the neon dashboard (glowing chrome, gradients on controls, saturated UI color).

**Key Characteristics:**
- Dark, single-scheme world (`color-scheme: dark`). There is no light mode.
- Light lives only in data (additive canvas glow) and in signal lamps (verdict flags); chrome never glows.
- Four validated categorical lamp hues, each with a lit core variant for canvas.
- Bodoni Moda tells the story, Archivo runs the interface, JetBrains Mono carries numbers.
- Chapters are scroll stories: an opener with a full-height stage, sticky steps, Q acts with frameless figures, and a closing bridge.
- Motion is slow for story (1200 ms), fast for UI (160 to 240 ms), and snaps under reduced motion.

## Colors

The palette is moonlight on deep water, with four lamp hues that appear only where data or a verdict is lit.

### Primary
- **Bioluminescent Teal** (series-1): the first categorical series and the system's default "lit" hue. It is used for claim underlines, text selection, the sequential ramp's top, companies in node-link views, and co-owned structure in MC3. Its lit core (lit-1) is the white-hot center of additive canvas marks.

### Secondary
- **Amber Lamp** (series-2): the second series and the "Possible" verdict lamp. Its lit core (lit-2) marks embers and removed names in the MC3 break, and the loading lamp that runs up the halyard.
- **Rose-Red Lamp** (series-3): the third series, the "Suspect" verdict lamp, and the error emphasis. It is the default horizon tint of chapter openers.

### Tertiary
- **Blue Lamp** (series-4): the fourth series and the "Unlikely" verdict lamp. It tints the home horizon and the blue chapter opener.
- **Lit cores** (lit-1 to lit-4): brighter partners of the four lamps. They are used only as the cores of glow drawn with `lighter` compositing on canvas, never as flat fills in the DOM.

### Neutral
- **Abyss** (abyss): the deepest water. It sits behind stages, at the top of opener and hero gradients, and under the footer.
- **Night Water** (ground): the page ground, and the solid backing for sticky stages and table heads.
- **Raised Water** (cloth): the one raised surface, for tooltips, the select, the bridge button, inline code, the method verdict key, and table row hover.
- **Swell** (swell): the hover and selected surface for pressed chips, the active nav link, and the bridge button on hover.
- **Moonlight** (ink): primary text, 15.6:1 on ground. It is also series-5, which is only ever used outlined or dashed.
- **Mist** (ink-2): secondary text, ledes and step prose (9.4:1).
- **Haze** (ink-3): muted text, axis labels, captions and halyard lines (5.9:1 on ground, 5.2:1 on cloth). It doubles as the "Insufficient evidence" verdict lamp.
- **Hairline** (rule) and **Strong Hairline** (rule-strong): grids, dividers, step rules, chip and select borders.
- **Moon Accent** (moon): focus rings, the active step rule, the reading-progress line and the active nav count. It is the only "emphasis" color the chrome is allowed.
- **Slate** (series-other): "other" and unknown entities, and fragments dimmed out of focus.

### Flag cloth
- **Signal Red, Signal Blue, Signal Yellow, Signal Black, Signal White** (flag-red, flag-blue, flag-yellow, flag-black, flag-white): true ICS cloth colors. They are used only inside flag and pennant drawings.
- **Moonlit Edge** (flag-edge): the single 1px non-scaling outline on every flag, so black and blue cloth reads on the dark water.

### Named Rules
**The Chrome Never Glows Rule.** Glow (additive blending, colored drop-shadows, lit cores) belongs to data that stands for light and to the verdict lamps. Headers, rails, buttons, chips and figure furniture get hairlines and moonlight text only. The dark `halo` text-shadow is a legibility scrim over stages, not a glow.

**The Second Encoding Rule.** The four lamp hues passed the dataviz validator on #07111b for all pairs, but teal and rose fall in the colour-vision-deficiency warning band. Every categorical mark therefore carries a second channel: shape for entity types (square, circle, diamond, triangle, hex, cross), a label in stage keys, or a dash for lines. Verdict lamps always come with a flag and a written verdict.

**The Moonlight Is Not a Series Rule.** Moonlight is the neutral. When series-5 is used at all, it is outlined (fills) or dashed (`4 3`, lines) and never stands for a category on its own color.

**The Fixed Order Rule.** Categorical slots are assigned in validated order and follow the entity, not its rank. They are never cycled.

## Typography

**Display Font:** Bodoni Moda (with Didot, Bodoni 72, Georgia), with optical sizing on
**Body Font:** Archivo (with ui-sans-serif, system-ui), variable width axis at 100
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo), with tabular numerals

**Character:** A high-contrast Didone sets the story like engraved chart lettering. A plain grotesque runs everything you operate. Numbers are set in mono, so measurements read as instrument readouts and not as prose.

### Hierarchy
- **Display** (400, `clamp(3.25rem, 1.6rem + 5.4vw, 6rem)`, 0.96): the home title only, max 13ch.
- **Headline** (400, `clamp(2.5rem, 1.6rem + 2vw, 3.75rem)`, 1): chapter opener titles. The Method page uses the larger `--fs-h1` ramp step.
- **Headline, act** (400, `clamp(2rem, 1.3rem + 2.2vw, 3.25rem)`, 1.04): Q act titles (max 24ch), home route titles, and Method section heads.
- **Takeaway** (400, `clamp(1.75rem, 1.15rem + 2.3vw, 3.25rem)`, 1.1): the closing bridge sentence. It rests in Haze and turns Moonlight when it is reached.
- **Title** (500, `clamp(1.375rem, 1.15rem + 0.7vw, 1.75rem)`, 1.15): step titles, hoist names on Home, and prose h3.
- **Subtitle** (500 italic, `clamp(1.125rem, 1rem + 0.6vw, 1.5rem)`, 1.3): the serif-italic line under a chapter title, in Mist.
- **Stage label** (500 italic, 17px): names drawn inside canvas stages, such as structures, hubs and "Oceanus". Below it there is an optional second line in 12px Archivo.
- **Lede** (Archivo 400, 1.125rem, 1.6): opener and hero ledes, max about 36 to 38rem.
- **Body** (Archivo 400, 1rem, 1.55, prose 1.65): prose with a measure of 62ch.
- **Label strong** (Archivo 500, 1rem): figure titles, compact hoist names and home path titles.
- **Small / Label** (Archivo, 0.875rem / 0.8125rem / 0.75rem): captions, legends, stage keys and verdict lines.
- **Readout / Data** (JetBrains Mono, tabular): headline numbers on Home, stage counts, Q numbers, ids, and numeric table cells.

### Named Rules
**The Sturdy Small Serif Rule.** Bodoni Moda's hairlines break up on the dark below about 28px. Serif settings at title size and below (h3, h4, step titles, the subtitle, stage labels, the wordmark) use weight 500 with optical sizing on. Display sizes stay at 400.

**The Serif Tells, Sans Operates Rule.** Bodoni Moda is for story voice only: titles, takeaways, step titles, and italic names in the stage. Anything under about 20px that is read for information, and anything you operate (figure titles, compact hoist names, nav, buttons, chips, axis text, data labels), is Archivo. The only small serif is the 17px italic stage label and the chapter subtitle, both at weight 500.

**The Mono Is for Measurements Rule.** JetBrains Mono sets numbers, ids and codes, and never prose.

**The Archivo Minus Rule.** A minus sign in serif text is set in Archivo, because Bodoni Moda's minus is a hairline.

## Layout

There is one 4px-based spacing rhythm (s-1 to s-10, from 4 to 144px). The side gutter is `clamp(16px, 4vw, 64px)`, and acts are separated by `clamp(72px, 12vh, 144px)`. Content rows cap at 1440px (openers, home) or 1600px (chapter story and page). The prose measure is 62ch, and every tap target is 44px.

**Header.** A sticky translucent header with backdrop blur. `--header-h` is measured at runtime by a ResizeObserver (65px default, 96px when it wraps on phones), and every sticky stage and scroll target pins beneath it.

**Chapter opener.** This is a full-viewport night scene (`100svh - header`) in two regions. The words hold the left 44%: flag mark, serif title, italic subtitle, lede, then the compact hoist. The chapter's stage fills the right of the band from 40% of the content row, so about 60%, at full band height. A mask fades it into the water at its left and bottom edges. A radial "horizon" tinted by the chapter's lamp (rose, blue or amber) sits at the bottom right. Below 1100px the stage stacks on top at 46svh and the words follow.

**Scroll story.** This is a two-column grid: steps at 24rem on the left and a sticky stage filling the rest (`100svh - header`, min 420px). The steps sit on the dark with no card and are spaced 55vh apart. Below 960px the stage pins directly under the header at 46svh (min 280px) above the steps, which scroll beneath it with a fade. The steps never cover the stage.

**Q acts.** Each act has a mono number, a serif title and a small prompt. The answer prose follows, then the evidence figures. At 1280px and wider, the answer takes a 34rem left column and can pin, and the evidence runs on the right.

**Rail and progress.** A 64px chapter rail on the right holds flag stops on a vertical halyard. Below 960px it becomes a sticky horizontal strip under the header. A 2px Moon line fixed to the top edge fills as the chapter is read. The `n` and `p` keys (and `0` to `4`) move between chapters.

**Bridge.** Each chapter closes on a 70svh band with one takeaway sentence, a lead-in, and a pill button to the next chapter.

## Elevation & Depth

Depth comes from water, not from paper. Surfaces are flat and separated by tone (abyss, ground, cloth, swell) and by hairlines. Light is the only thing that rises off the surface, and it is reserved for data and lamps. Floating chrome (the tooltip, rail labels) gets one dark shadow with a faint moonlit ring and a backdrop blur, so it reads as a pane over the water.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(214 228 255 / 0.08)`): tooltips and halyard rail labels only.
- **Halo** (`text-shadow: 0 1px 3px rgb(5 12 20 / 0.95)`): a dark scrim under text set over a stage (opener title and lede, stage keys and counts, hero copy). It is not a glow.
- **Lamp glow** (`filter: drop-shadow(0 0 18px color-mix(in oklab, var(--flag-yellow) 22%, transparent))`): the verdict flags on the full hoist. Flags in the compact opener hoist drop it.
- **Canvas glow**: radial sprites (white core, lamp hue at 12%, 42% alpha at 32%, transparent edge) drawn with `globalCompositeOperation = 'lighter'`, so dense regions bloom.

### Named Rules
**The Light Is Data Rule.** If something glows, it is either a datum that represents light or a verdict lamp. The test: remove the glow, and if the meaning is unchanged the glow was decoration and has to go.

## Shapes

The form language is hairlines and lines of rope. Corners are small: 4px for inputs, badges and focus rings, 8px for the tooltip and panels, 2px for legend swatches and the claim highlight, and a pill only for segmented chips, nav links and the bridge button. Figures are frameless, with no border, card or background. The data sits directly on the water, and a hairline sits above the caption. Halyards (1px Haze or rule-strong lines with a small ring at the masthead) thread every verdict list, the chapter rail and the loading state. ICS flags are flat 60×45 drawings, and numeral pennants are 90×36. Each has a single 1px moonlit outline.

## Components

### Buttons and Chips
- **Shape:** fully rounded pill (999px) for chips and the bridge button. The select uses 4px.
- **Chip:** transparent with a rule-strong border, Mist text, 32px tall (44px on coarse pointers). When pressed it takes the Swell fill with a Moon border at 45% and Moonlight text.
- **Bridge next:** a Raised Water pill, 44px tall, with a mono chapter number, the title and an arrow. On hover it moves to the Swell fill with a Haze border, and the arrow nudges 2px.
- **Press:** everything you press scales to 0.97 to 0.985 over 100ms.
- **Focus:** a 2px Moon outline at a 3px offset, everywhere.

### Claim (signature)
An inline button in the prose that lights its evidence. It has a 1.5px teal underline at rest, and on hover or when pressed a 30% teal wash fills up from the baseline over 240ms. On coarse pointers it gets a 44px invisible hit band.

### Figures
Figures are frameless. An Archivo 500 title and a Haze subtitle sit on top, chips and the legend below them, then the body, then a caption in 0.75rem Haze above a hairline. A Table toggle turns any figure into a data table with a sticky head, mono numerals and Raised Water row hover. Chart text is 12px Archivo in Haze. Axes use rule-strong and grids use rule, with no dashes. Dimmed marks drop to 0.2 opacity.

### Scroll Steps
Steps are set on the dark: a 1px rule-strong left rule with 24px of inset, the title in Bodoni 500 and prose in Mist. Inactive steps rest at 0.4 opacity. The active step goes to full opacity and its rule turns Moon over 240ms.

### Stage Corners
Every stage uses one quiet corner language. The lit key sits bottom-left (or top), with a colored dot, ring (for verdicts) or short stroke plus a label, so color is never alone. A JetBrains Mono count in Haze with Moonlight numbers sits bottom-right. Both carry the halo and ignore pointer events.

### Navigation
The header holds the wordmark (L flag plus serif "Signal Hoist") and pill links for each chapter, each with its flag and a mono "MC1" count. The active link takes the Swell fill and turns its count Moon. The chapter rail uses flag stops at 0.55 opacity, and the current stop is at full opacity, scaled 1.12. Labels appear as floating panes on hover or focus.

### Verdict Hoist (signature)
Verdicts are hoisted as real ICS flags: **L** for Suspect ("Stop your vessel instantly"), **U** for Possible ("You are running into danger"), **X** for Insufficient evidence ("Stop and watch for my signals") and **N** for Unlikely ("Negative"). Numeral pennants 1 to 3 show confidence (Low, Medium, High). In chapter openers, the compact hoist is a single quiet column of real buttons on a rule-strong halyard. Each row has a 24px flag, an Archivo 500 name (ellipsized), and the verdict and confidence on one line at 0.8125rem. On the home page, the full hoist runs flags up the halyard with a 640ms staggered hoist animation.

### Tooltip
The tooltip is a fixed floating pane: Raised Water at 92% with a backdrop blur, 8px corners, Float shadow, max 300px. It has a bold title and rows of label against a mono value. It enters over 160ms from 0.97 scale and is instant during continuous pointer moves.

### Glow Stage (signature)
This is a canvas engine that draws thousands of marks as light. Callers describe a target state (per-node alpha, scale and color, edge alpha, position set A or B, camera box, labels, rings), and the stage eases every value toward it over 1200ms (cubic in-out, or out when the motion should start on landing). Then it stops drawing. Per-node and per-edge delays let a change ripple. Labels come in two voices: 12px Archivo data labels, and 17px Bodoni italic story names with hairline leaders past 14px. Reduced motion snaps to the target. Stages pause when off screen or when the tab is hidden.

### Bridge
The bridge closes the chapter. The takeaway rests in Haze and turns Moonlight over 400ms when it reaches the middle of the viewport. A Mist lead-in and the next-chapter pill follow.

### Loading state
A short Haze halyard with an amber lit lamp (lit-2 with a 12px glow) that runs up and down. This is one of the sanctioned lamps.

### Motion
Press 100ms, hover 160ms, UI 240ms, hoist 640ms, data 700ms, story 1200ms. The easings are `--ease-out` (0.23, 1, 0.32, 1), `--ease-in-out` (0.77, 0, 0.175, 1) and `--ease-hoist` (0.32, 0.72, 0, 1). The MC3 "galaxy breaks" step is the longest move: 1700ms ease-out with staggered delays, so the rim lands near 1.9 to 2s. Under reduced motion, data, hoist and story tokens go to 0, UI to 120ms, transitions are limited to opacity and color, and canvases draw a still frame.

## Do's and Don'ts

### Do:
- **Do** set every page on Night Water (#07111b) with Moonlight text, and keep raised surfaces to Raised Water and Swell.
- **Do** put light only into data and verdict lamps: canvas marks drawn with `lighter` compositing and lit cores, and flags with lamp glow.
- **Do** pair every categorical color with a second encoding (shape, label or dash). Teal and rose must never be told apart by color alone.
- **Do** assign categorical slots in fixed order (teal, amber, rose, blue) so the color follows the entity.
- **Do** use Bodoni Moda at weight 500 with optical sizing for any serif under about 28px, and Archivo for anything operated or under about 20px.
- **Do** build each chapter as opener, then sticky scroll story, then Q acts, then bridge, with the story-progress line and n / p keys.
- **Do** name structures inside the stage with 17px Bodoni italic labels, and keep keys and mono counts in the stage corners.
- **Do** pin the stage under `--header-h` above the steps on phones.
- **Do** pause canvases off screen and snap all story motion under reduced motion.

### Don't:
- **Don't** make chrome glow. Use no colored shadows, gradients or lit cores on the header, rail, chips, buttons or figure furniture.
- **Don't** frame figures in cards, borders or panels. The data sits on the water.
- **Don't** use moonlight as a series color or treat it as a category.
- **Don't** use lit variants (lit-1 to lit-4) as flat DOM fills. They are cores for additive canvas glow.
- **Don't** set Bodoni Moda at weight 400 below about 28px. Its hairlines break up on the dark.
- **Don't** use JetBrains Mono for prose.
- **Don't** let scroll steps cover the stage, or put the steps in cards.
- **Don't** introduce a light theme. The world is single-scheme dark.
