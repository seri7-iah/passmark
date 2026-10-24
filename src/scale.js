/**
 * The example 1.0-5.0 scale.
 *
 * This is a straight line made up for this page, not any school's
 * transmutation table. 1.00 is 100%, 5.00 is 20%, and every 0.25 step is
 * 5 points. Phase 3 makes this table editable; the functions here already
 * accept any list of `{ grade, percent }` points so the UI never has to
 * special-case the default.
 *
 * Points are expected with grade ascending (1.00 -> 5.00), which means
 * percent descending (100 -> 20). Interpolation is linear between points.
 */

export const EXAMPLE_SCALE = [
  { grade: 1, percent: 100 },
  { grade: 1.25, percent: 95 },
  { grade: 1.5, percent: 90 },
  { grade: 1.75, percent: 85 },
  { grade: 2, percent: 80 },
  { grade: 2.25, percent: 75 },
  { grade: 2.5, percent: 70 },
  { grade: 2.75, percent: 65 },
  { grade: 3, percent: 60 },
  { grade: 3.5, percent: 50 },
  { grade: 4, percent: 40 },
  { grade: 5, percent: 20 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isPoint = (point) => Number.isFinite(point?.grade) && Number.isFinite(point?.percent);

/** Sorts a table by grade and drops duplicate grades. Falls back to the example. */
export function normalizeScale(points) {
  if (!Array.isArray(points)) return EXAMPLE_SCALE.map((point) => ({ ...point }));
  const seen = new Set();
  const cleaned = points
    .filter(isPoint)
    .map((point) => ({ grade: point.grade, percent: point.percent }))
    .sort((a, b) => a.grade - b.grade)
    .filter((point) => {
      if (seen.has(point.grade)) return false;
      seen.add(point.grade);
      return true;
    });
  return cleaned.length >= 2 ? cleaned : EXAMPLE_SCALE.map((point) => ({ ...point }));
}

/** 1.00 -> 100%, 5.00 -> 20% on the example table. Clamps outside the table. */
export function scaleToPercent(grade, points = EXAMPLE_SCALE) {
  if (!Number.isFinite(grade)) return null;
  const table = normalizeScale(points);
  const first = table[0];
  const last = table[table.length - 1];
  if (grade <= first.grade) return first.percent;
  if (grade >= last.grade) return last.percent;

  for (let i = 0; i < table.length - 1; i += 1) {
    const a = table[i];
    const b = table[i + 1];
    if (grade >= a.grade && grade <= b.grade) {
      const span = b.grade - a.grade;
      if (span === 0) return a.percent;
      const t = (grade - a.grade) / span;
      return a.percent + t * (b.percent - a.percent);
    }
  }
  return last.percent;
}

/** 100% -> 1.00, 20% -> 5.00 on the example table. Clamps outside the table. */
export function percentToScale(percent, points = EXAMPLE_SCALE) {
  if (!Number.isFinite(percent)) return null;
  const table = normalizeScale(points);
  const first = table[0];
  const last = table[table.length - 1];
  const highest = Math.max(first.percent, last.percent);
  const lowest = Math.min(first.percent, last.percent);
  if (percent >= highest) return first.grade;
  if (percent <= lowest) return last.grade;

  for (let i = 0; i < table.length - 1; i += 1) {
    const a = table[i];
    const b = table[i + 1];
    const top = Math.max(a.percent, b.percent);
    const bottom = Math.min(a.percent, b.percent);
    if (percent <= top && percent >= bottom) {
      const span = b.percent - a.percent;
      if (span === 0) return a.grade;
      const t = (percent - a.percent) / span;
      return a.grade + t * (b.grade - a.grade);
    }
  }
  return last.grade;
}

/** Convenience for the UI: percent clamped to what the table can express. */
export function scaleForPercent(percent, points = EXAMPLE_SCALE) {
  const grade = percentToScale(percent, points);
  return grade === null ? null : clamp(grade, 1, 5);
}
