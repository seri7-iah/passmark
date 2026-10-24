# Design guide

## Project

- What it is: Passmark, a one-page calculator for the score you need on a final exam
- Who it's for: Filipino college students checking a partial grade against a target
- Surface mode: Operate. The visitor is mid-task, on a phone, often anxious.
- Mood in 3 words: calm, studious, exact
- The visual world: **the study sheet** — warm paper, ink, one highlighter
  amber for points already banked, textbook serif for the answer, and one
  annotated 100-point strip that carries the whole result.

This is not a dashboard, a bank app, or a landing page. The result is an
instrument drawn on paper, not a card floating in space.

## Fonts

- Display, headings, the answer number, the plain-English verdict:
  **Source Serif 4** (400, 600). Textbook, not editorial; warm but not soft.
- UI, labels, body, captions, buttons: **Source Sans 3** (400, 600, 700).
  The superfamily keeps the serif from feeling like a different product.
- Both are free on Google Fonts. Only these two families. No Inter, Roboto,
  Space Grotesk, or a third display face.
- The answer number is 104px desktop / 80px phone, weight 600, tabular lining
  figures, tracking -0.035em. The `%` is Source Sans 3 at 0.3em, ink-soft.
- Headings are 400/600 serif. Never all-caps serif; small caps labels are
  Source Sans 3.
- Body measure 52–68ch. Headings `text-wrap: balance`, prose `pretty`.

## Colors (use only these)

| Token | Hex | Role |
|---|---|---|
| Paper | `#F7F3E8` | page background |
| Paper deep | `#EFE8D6` | the answer band only |
| Paper raised | `#FFFDF7` | inputs, buttons, the open strip segment |
| Ink | `#1C1A15` | text, pass marker, primary button |
| Ink soft | `#5B564B` | secondary text, labels, captions |
| Line | `#D8CFBB` | rules and group borders |
| Line strong | `#8C8472` | input borders, chart boundary, dashed example rule |
| Blue | `#1E4E8E` | action, focus, links, weight-coverage fill |
| Amber | `#E9B64C` | points already earned — the highlighter |
| Lost sand | `#E3D9C3` | points not earned / out of reach in the strip |
| Green | `#2B6750` | Reached / Reachable state word |
| Ochre | `#7A5510` | Tough state word |
| Brick | `#99392A` | Not reachable, errors, over-budget |

Contrast: ink on paper 14.2:1, ink-soft on paper-deep 6.0:1, blue on paper
7.5:1, green on paper-deep 5.4:1, ochre 5.5:1, brick 5.8:1, ink on amber 9.3:1.
Focus is 2px blue with a 2px offset.

No purple gradients. No pure black surfaces. No gradients or glows as
decoration. Colour never carries a state alone: every state also has a word.

## Spacing and shape

- Spacing: 4, 8, 16, 24, 32, 64 px only.
- Radius: 6px on buttons and inputs only. 0 everywhere else.
- Shadows: none. The answer band is a tinted full-bleed surface, not a card.
- Page shell: 880px. The form column: 620px. The answer band spans the
  viewport and centres its contents at 880px.
- Strip height: 32px desktop, 28px phone. Never taller than 32px.
- Touch targets: 48px minimum for buttons and inputs, 44px for text links.

## Layout

1. Masthead: wordmark + save state, then `What you need on the final.` and one
   short lede. Keep it compact; it is not a hero.
2. Answer band, full-bleed, tinted paper-deep. This is the first and largest
   thing: state word, the target, the figure, the plain sentence, the strip,
   then "How this was computed".
3. The guided steps below, left-aligned in the 620px column, under a 3-segment
   progress rule and "Step n of 3".
4. Footer: privacy, the school-decides line, Start over.

Desktop answer band: state row, then a two-column verdict (figure left, copy
right, baseline-aligned at the bottom), then the strip across the full width.
Phone: everything stacks; the figure stays 80px and the strip spans the 343px
content width.

## The course strip (the visual answer)

The strip is always a full 100 points of the course, drawn left to right:

- **Earned** — solid amber. Points already secured by graded work.
- **Still open** — paper-raised. The weight that can still move (the final
  exam or ungraded parts).
- **Not earned / out of reach** — lost sand, dashed left edge. Points already
  lost, or, when the target is impossible, points no score can reach.
- **Pass mark** — a 2px ink tick entering the top of the bar, with a `Pass 75%`
  label above. The label flips to the inside at the two edges.
- **Distance bracket** — a thin 1px bracket under the bar spanning the points
  still to find (earned→pass), the cushion (pass→earned), or the shortfall
  (best→pass). Brick when the shortfall cannot be closed. Hidden below a
  3-point span; the caption carries the number instead.
- In-bar labels (`Earned 49.5`, `Open 40`, `Not earned`) appear only when the
  segment is wide enough (26% / 22% / 26%). They never overflow.
- The caption is one line of points, in words: `25.5 points to go · 40 still
  open`.

Rules:

- No strip for empty, invalid, or over-100 states. Never invent geometry.
- The strip is `role="img"` with a full sentence `aria-label`; its inner text
  is not separately exposed.
- The strip shows points out of 100, not the 1.0–5.0 scale. The scale is an
  example only and must never be the primary visual or look like school policy.
- `Earned` is the weighted points already banked, not the average grade.
  `Open` is the weight that can still move. `Best` is earned + open. The lost
  segment is `100 - best`.

## State words

Always shown as a word plus a 24px rule; colour reinforces but never replaces
the word. The word sits at the top left of the answer band.

| Word | When | Note under it |
|---|---|---|
| Not yet | Nothing to solve | none |
| Check your entries / Check the parts | Invalid or over 100% | none |
| Reached | The pass mark is already secure | none |
| Passed / Missed | Every part is scored | none |
| Reachable | Needed score is at or under the student's pass mark | `Under your 75% pass mark.` |
| Tough | Needed score is over the pass mark, but 100% still works | `Still possible — over your 85% pass mark.` |
| Not reachable | Even 100% falls short | none |

`Tough` is not a claim about school policy or difficulty curves. It is a
comparison with the student's own pass mark, stated in the note. Never invent
a difficulty threshold or a probability.

## Writing tone

- Short, direct sentences. Say what the thing does.
- The engine's `sentence` and `detail` stay. Do not replace them with slogans
  or reassurance.
- Captions may add points, never predictions. `24.5 points to go`, not
  `you've got this`.
- Every dead end is still a sentence with a fix, never a blank.
- The example scale is always called the example scale.

## Don't

- No stock hero, no big centred headline with two buttons.
- No three identical cards in a row, no stat-card grid.
- No emoji or unicode glyphs as icons.
- No drop shadows, floating panels, glows, gradients, or glass.
- No colored left borders on callouts or list items.
- No purple. No pure black background.
- No invented numbers, testimonials, school names, or grading policies.
- No colour-only state. Always the word.
- No animation beyond the budget bar and 120ms interactive transitions.
