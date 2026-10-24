# NOTES

_Last updated: design pass. Phase 4 started._

## Status at a glance

| Phase | State |
|---|---|
| 1 — math module + tests | **Done.** `src/engine.js`, `src/scale.js`, 43 Vitest tests passing. |
| 2 — guided interface | **Done.** Three-step flow wired to the engine; old `src/calc.js` removed. |
| 3 — missing scores + editable scale | Not started. |
| 4 — critique / audit / polish | **In progress.** Critique done, "study sheet" direction built, answer band rebuilt around a 100-point course strip. Tests and build clean. Browser and screenshot checks were skipped this session by request; see “Not verified”. |

`src/App.jsx` and `src/styles.css` are the current "study sheet" UI. Every
user-facing number still comes from `calculatePlan` in `src/engine.js`.

## Session log

### Phase 1–2 (history)

- Read AGENTS.md, DESIGN.md, PRODUCT.md, NOTES.md.
- Built the pure engine and the test suite. 43/43 pass.
- Ran `impeccable context`; replaced the old `src/App.jsx` and
  `src/styles.css`; deleted `src/calc.js`.
- Changed the engine's user-facing "weights" copy to "parts" / "counts for";
  updated tests and added an assertion for the missing-total fix.
- The Phase 2 UI was browser-checked at desktop and 375px before this design
  pass. Those captures describe the old answer band, not the current one.

### Design pass (this session)

- Read AGENTS.md, DESIGN.md, PRODUCT.md, NOTES.md, `src/App.jsx`,
  `src/styles.css`, `src/engine.js`, `src/scale.js`, `index.html`,
  `package.json`.
- Ran `impeccable context`; ran the critique as two independent passes: a
  design review and the deterministic detector. The detector returned `[]` for
  the old `src/App.jsx`. No browser or screenshot tools were used.
- Chose **"Study sheet"** over the alternate **"Ruler"** direction. Study
  sheet: warm paper, Source Serif 4 display, Source Sans 3 UI, a full-bleed
  tinted answer band, and one annotated 100-point course strip. Ruler was
  colder and read like a bank app.
- Rebuilt the answer band: state word + note, target, large figure, plain
  sentence, detail, labelled example-scale line, the strip, then
  "How this was computed".
- Added the strip model, state rules, min-aware aim/bracket, point
  pluralization, and focus management for the example jump.
- Rewrote `src/styles.css`; updated `index.html` to Source Serif 4 + Source
  Sans 3 and `theme-color` `#F7F3E8`; rewrote `DESIGN.md`.
- No changes to `src/engine.js`, `src/scale.js`, or the math.

## Files

| File | What it is |
|---|---|
| `src/engine.js` | Pure calculation module. The source of truth for the UI. |
| `src/scale.js` | Example 1.0–5.0 ↔ percent table; accepts any `{grade, percent}` list. |
| `src/engine.test.js` | 43 Vitest tests. |
| `src/App.jsx` | Three-step UI and the "study sheet" answer band. Imports `engine.js`. |
| `src/styles.css` | Study-sheet tokens, type, layout, strip, and form styles. |
| `src/calc.js` | **Removed.** No imports remain. |
| `index.html` | Loads Source Serif 4 + Source Sans 3. Meta description says "how much each one counts". |
| `DESIGN.md` | The current study-sheet system: palette, type, spacing, strip rules, state rules. |
| `PRODUCT.md` | Product brief and honesty constraints. |
| `public/` | Empty. No temporary preview files. |

## Phase 1: engine contract

```js
calculatePlan({
  passPercent: 75,
  minFinalPercent: '',            // optional floor on the final
  components: [{
    id, name, weight: 30,
    combine: 'average' | 'points' | 'drop-lowest',
    dropLowest: 0,
    items: [{ id, name, score, total, status: 'graded' | 'pending' | 'unknown' }],
  }],
  solveFor: componentId,
}, { guessPercent, guessSpread, scale })
```

`status` is one of: `empty`, `invalid`, `weights-over`, `need`, `reached`,
`impossible`, `complete`, `scenarios`.

Every result returns `sentence`, `detail`, `steps[]`, `problems[]`,
`notices[]`, `targets[]`, and the numbers (`earnedPercent`, `gradedWeight`,
`targetWeight`, `neededPercent`, `neededScale`, `bestPercent`,
`floorPercent`).

### Locked decisions

- **Leftover weight is the final.** Prelim 30 + Midterm 30 with no Final row →
  the final is 40. Under 100 gets a notice, not a block. Over 100 blocks
  (`weights-over`).
- **One number across all remaining weight.** Two or more ungraded parts →
  `neededPercent` is the average needed across them. `targets` lists them,
  `primaryTargetId` names the chosen one.
- **The optional minimum is a floor.** 63.75% needed with a 70% minimum →
  `neededPercent` 70, `minimumApplied` true, `rawNeededPercent` 63.75.
- **Blank is never zero.** A graded item with a blank score/total is a blocking
  problem. `pending` items are ignored. `unknown` items produce three scenarios.
- **Scenarios** use the graded average (or 75) as the middle, ±15 for low/high.
  No top-level `neededPercent` in that state.

## Phase 2: the guided form (current)

1. **Step 1 of 3 — "Your school's passing percentage"**
   - Passing percentage field with a `%` suffix.
   - Optional "Lowest score allowed on the final" field, marked Optional.
   - Primary: **Next: your grades**. Secondary: **Try an example**.
2. **Step 2 of 3 — "Your grades so far"**
   - One row per part: name, **Your score**, **Out of**, **How much it counts
     for**.
   - Two notes: leave both numbers blank if a part has not been taken; the final
     exam is added automatically from the leftover weight.
   - Add another part (max 8). Remove per row.
   - Budget rule + line: "This covers 60%. The final exam is the other 40%."
     Over 100: "These add up to 120%. Take 20% off one part."
   - Hint: "Where do I find this? Check your syllabus or ask your teacher."
   - Primary: **Next: what to find out**.
3. **Step 3 of 3 — "What do you want to find out?"**
   - Radio list from `plan.targets` (implicit final + any ungraded parts),
     default the final, each with its weight.
   - If more than one is open: "The answer is the average you need across them."
   - Primary: **Show the steps** (opens the collapsed panel and focuses it).
     Secondary: **Back to your grades**.

## Phase 4: the answer band

- Full-bleed `--paper-deep` band, first thing inside `<main>`, not a card. The
  inner content is centred at 880px.
- **State row:** a 24px word + rule, then a short note. The word is always
  present; colour only reinforces it. `Reachable`/`Reached` use green, `Tough`
  ochre, `Not reachable`/`Check…` brick, `Not yet` ink-soft.
- **Target line:** "Final exam · 40% of your grade" or "2 open parts · 40% of
  your grade, averaged".
- **Verdict:** the large figure (104px desktop / 80px phone, Source Serif 4)
  on the left, the plain sentence + detail + scale line on the right. The
  figure is hidden from assistive tech because the sentence repeats it.
- **No giant numeral** for empty, invalid, over-100, or the `scenarios` state.
  Those states use the plain sentence, at 26px / 24px.
- **How this was computed:** native `<details>`, collapsed, inside the band.

### The course strip

Always 100 points of the course, left to right:

- **Earned** — amber, the points already banked.
- **Still open** — paper-raised, the weight that can still move.
- **Not earned / out of reach** — lost sand with a dashed left edge.
- **Pass mark** — a 2px ink tick entering the top 6px of the bar, with a
  `Pass 75%` label above. The label flips inside at the two edges. The tick does
  not cross the bar, so it cannot cut through the in-bar labels.
- **Distance bracket** — a 1px bracket under the bar: earned→pass for a target
  still to find, pass→earned for a pass already secured, best→pass for an
  impossible target, and earned→aim when the optional minimum raises the
  target. Brick when the gap cannot close. Hidden under a 3-point span; the
  caption carries the number.
- In-bar labels appear only when the segment is wide enough (26% earned, 22%
  open, 26% lost). They are clipped rather than allowed to overflow.
- Caption is one line of points: "25.5 points to go · 40 still open",
  "1 point above your pass mark · 20 still open", "5.5 points short of your
  95% pass mark", or "Your course also needs 50% on the final."
- `role="img"` with a full `aria-label`; the visible in-bar text is not exposed
  separately. The caption is outside the image and is read after it.

Rules:

- No strip for empty, invalid, or over-100. Never invent geometry.
- Points are out of 100, not the example 1.0–5.0 scale. The scale stays a
  labelled secondary line.
- `open` = best − earned; `best` = earned + the still-open weight; `lost` =
  100 − best.

### State words

| Word | When | Note under it |
|---|---|---|
| Not yet | Nothing to solve | none |
| Check your entries / Check the parts | Invalid or over 100% | none |
| Reached | The pass mark is already secure | `The course minimum still applies.` when a minimum is set |
| Passed / Missed | Every part is scored | none |
| Reachable | Needed score is at or under the student's pass mark | `Under your 75% pass mark.` |
| Tough | Needed score is over the pass mark, but 100% still works | `Still possible — over your 85% pass mark.` |
| Not reachable | Even 100% falls short | none |

`Tough` is a comparison with the student's own pass mark, not a school policy
or a difficulty probability. The note says so on screen; `DESIGN.md` records
the same rule.

### Behaviours

- **Try an example** fills pass 75; Prelim 85/100 @30; Midterm 80/100 @30;
  jumps to step 3, focuses the hidden "Your answer" heading, and scrolls the
  band into view. Shows "These are example numbers, not yours." with **Clear
  the example**. The flag clears on the first edit.
- **Gating:** step 1 needs a valid pass % and minimum (or blank). Step 2 needs
  at least one usable part, no part-level problems, and total weight ≤ 100. A
  plan with every part already scored also stops at step 2 ("Every part has a
  score. There is nothing left to find out."). Each disabled primary has a
  visible reason.
- **Persistence:** `localStorage` key `passmark.draft.v2`, storing
  `{ step, passPercent, minFinalPercent, parts[], solveFor, example }`. Restores
  to the same step. The old `passmark.draft.v1` key is removed on load. If
  storage is unavailable: "This browser is not saving entries."
- **Step change:** focus the step `<h2>` (`tabIndex={-1}`) and scroll to it.
- **Live region:** debounced (~800ms) state word + note + sentence + detail +
  scale, in a visually hidden `aria-live="polite"`.
- **Footer:** privacy line, "Passmark does the arithmetic. Your school decides
  the rules.", **Start over** (two presses, 5-second window).
- All three steps are `<form>` elements, so Enter submits from a field.

## Copy consistency

Done. The engine's user-facing over-100, missing-count, weight-range, and
complete-state copy says **parts** / **counts for**. The UI uses "Your score",
"Out of", and "How much it counts for". The answer band always uses the
engine's `sentence`, `detail`, and `steps`; the new copy only adds the state
word, target line, strip caption, and scale label. Points are singular at
exactly one ("1 point above…") and plural otherwise.

## Tests

`npm test` → **43 passed**, 1 file, Vitest 3.2.7, Node 24.

Covers the required 63.75% case, the same case without a Final row, 120%
weights, 33.3/33.3/33.4 rounding, impossible + best case, already reached,
finished above/below the pass mark, the minimum floor, blank vs zero, missing
totals, score over total, zero total, negative score, two ungraded parts,
average / points / drop-lowest, three scenarios and a set guess, unknown inside
a points part, empty/invalid plans, the scale, formatting.

## Verified this session

- `npm test` — **43/43**.
- `npm run build` — clean. 33 modules; 12.79 kB CSS, 181.54 kB JS before gzip.
- **Server-side render check** (temporary Vitest file, deleted): rendered the
  real `<App />` for example / reachable, tough, impossible, reached, complete
  passed, complete missed, invalid, and empty, plus two minimum cases. Confirmed:
  - example: state `Reachable`, figure 64%, target "Final exam · 40% of your
    grade", strip 49.5 / 40 / 10.5, pass at 75, bracket 49.5→75, caption
    "25.5 points to go · 40 still open", 5 how-steps;
  - tough: 89%, caption "35.5 points to go · 40 still open";
  - impossible: 89.5%, bracket `is-out` 89.5→95, pass flag `is-end`;
  - reached: 0% needed, "1 point above your pass mark", no bracket under 3;
  - complete passed: 82%, bracket 75→82; complete missed: 70%, bracket
    `is-out` 70→75;
  - invalid and empty: no figure, no strip, the sentence carries the state;
  - minimum need 80%: bracket 49.5→81.5 (32 points), caption "Your minimum sets
    the target · 40 still open"; minimum reached 50%: bracket 76→86, note "The
    course minimum still applies.", singular "1 point".
- **Class coverage:** 78 static classes in `App.jsx`, none missing from
  `styles.css`; dynamic `state--*`, `strip-seg--*`, `pass-flag.is-*`,
  `budget.is-over`, and `verdict.is-text` were checked by hand.
- **Impeccable detector:**
  `.opencode\skills\impeccable\scripts\impeccable.cmd detect --json src\App.jsx src\styles.css index.html`
  → `[]` (no findings).
- `DESIGN.md` rewritten to the built system; `README.md` font and file facts
  corrected.

## Not verified / known limits

- **No browser and no screenshots this session, by instruction.** Therefore
  unverified: the actual desktop and 375px layout, the strip's geometry in a
  real renderer, Source Serif 4 / Source Sans 3 loading and fallback widths,
  the pass tick reading as a marker, the in-bar label thresholds (26/22/26),
  the bracket under the bar, focus rings, the example scroll/focus landing,
  localStorage persistence and reload, cross-browser behavior, zoom/text
  resizing, and 320px.
- The strip label thresholds are arithmetic estimates, not measured. A wider
  fallback font can clip an in-bar label by a few pixels; the caption and
  figure still carry the answer. Measure if this matters.
- The result band is **not sticky**. On step 2 the step heading is focused and
  scrolled to, so the answer can sit above the viewport while editing. The live
  region announces the new answer; there is no in-form visual preview.
- The optional minimum now moves the strip bracket to the aim while the pass
  tick stays at the pass mark. That is deliberate: the minimum can be above the
  pass. Verify the two markers read as two ideas, not one.
- `Reached` + a minimum shows a large minimum figure and the note "The course
  minimum still applies." It is honest but unusual; verify it does not read as
  a contradiction.
- The 1.0–5.0 conversion is the labelled **example** scale, not a school's
  transmutation table. Phase 3.
- `solveFor` is stored but does not change the number when more than one target
  is open: the engine's answer is the average across all of them. Phase 3.
- No automated DOM/UI tests remain. The server-render check was temporary and
  has been deleted.
- No git repository; no commits or worktrees.
- The designer-skill gate was INCOMPLETE in an earlier session (its engine
  cannot check two rules). The Impeccable detector is clean.

## How to run

- Tests: `npm test` (`npm run test:watch`).
- App: `npm install`, then `npm run dev`.
- Build: `npm run build`.
- Vitest 5 is **not** compatible with this project's Vite 5. Stay on Vitest 3.
