/**
 * Passmark's arithmetic. Pure functions: no DOM, no React, no storage.
 *
 * The model
 * ---------
 * The whole course is 100 points. Components ("parts" in the interface) hold
 * a weight in percent and a list of items. An item is a score out of a total,
 * and is one of three things:
 *
 *   graded   a real score; score and total are both required
 *   pending  not taken yet; it is ignored, never counted as zero
 *   unknown  the student can't see the score; the plan returns scenarios
 *
 * Whatever weight has not been earned is what the student is solving for:
 * the ungraded components plus any weight they have not assigned yet. The
 * answer is the average score needed across all of it, which is also the
 * score each remaining part needs if they all land on the same average.
 *
 * Every result carries a `status`, a plain sentence, and `steps`: the
 * arithmetic in words, in order.
 */

import { EXAMPLE_SCALE, percentToScale, scaleToPercent } from './scale.js';

export const EPSILON = 1e-9;
/** Weights may be off by a hair from rounding (33.3 + 33.3 + 33.4). */
export const WEIGHT_TOLERANCE = 0.01;
export const DEFAULT_GUESS_PERCENT = 75;
export const GUESS_SPREAD = 15;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Rounds half away from zero with a whisker of tolerance, so 25.5 / 40 * 100
 * (63.749999999999986 in floating point) still reads as 63.8 and not 63.7.
 */
function round(value, digits) {
  const factor = 10 ** digits;
  const nudge = value >= 0 ? 1e-9 : -1e-9;
  return Math.round((value + nudge) * factor) / factor;
}
const hasValue = (raw) => raw !== null && raw !== undefined && String(raw).trim() !== '';

/** Empty -> null, junk -> NaN, otherwise the number. Accepts "85%", "1,5". */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim().replace(/\s+/g, '').replace(/%$/, '');
  if (text === '') return null;
  if (text.includes(',') && !text.includes('.')) text = text.replace(',', '.');
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

/** 63.75 -> "63.8%" (digits 1) or "64%" (digits 0). Empty for non-numbers. */
export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '';
  const rounded = round(value, digits);
  if (rounded === 0) return '0%';
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(digits)}%`;
}

/** Points, without a percent sign: 49.5 -> "49.5", 30 -> "30". */
export function formatPoints(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = round(value, 1);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatScale(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

function capitalize(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function readItem(raw, index) {
  const status = raw?.status === 'pending' || raw?.status === 'unknown' ? raw.status : 'graded';
  return {
    id: typeof raw?.id === 'string' ? raw.id : `item-${index}`,
    name: typeof raw?.name === 'string' ? raw.name.trim() : '',
    status,
    scoreRaw: raw?.score,
    totalRaw: raw?.total,
    score: parseNumber(raw?.score),
    total: parseNumber(raw?.total),
  };
}

function isItemActive(item) {
  if (!item) return false;
  if (item.status !== 'graded') return true;
  return hasValue(item.scoreRaw) || hasValue(item.totalRaw);
}

function readComponent(raw, index) {
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .map((item, itemIndex) => readItem(item, itemIndex))
    .filter(isItemActive);
  const dropRaw = parseNumber(raw?.dropLowest);
  const combine = ['average', 'points', 'drop-lowest'].includes(raw?.combine)
    ? raw.combine
    : 'average';

  return {
    id: typeof raw?.id === 'string' ? raw.id : `part-${index}`,
    name: typeof raw?.name === 'string' ? raw.name.trim() : '',
    label: (typeof raw?.name === 'string' && raw.name.trim()) || `Part ${index + 1}`,
    weightRaw: raw?.weight,
    weight: parseNumber(raw?.weight),
    combine,
    dropLowest: Number.isFinite(dropRaw) && dropRaw > 0 ? Math.floor(dropRaw) : 0,
    items,
  };
}

/**
 * The percent a component currently sits at, or null when there is nothing
 * scoreable yet. `guess` fills in "unknown" items; null means "do not guess".
 */
function componentPercent(component, guess) {
  const values = [];
  let pointsEarned = 0;
  let pointsTotal = 0;

  for (const item of component.items) {
    if (item.status === 'pending') continue;

    if (item.status === 'graded') {
      values.push((item.score / item.total) * 100);
      pointsEarned += item.score;
      pointsTotal += item.total;
      continue;
    }

    if (item.status === 'unknown' && guess !== null) {
      values.push(guess);
      if (Number.isFinite(item.total) && item.total > 0) {
        pointsEarned += (guess / 100) * item.total;
        pointsTotal += item.total;
      }
    }
  }

  if (values.length === 0) return null;

  if (component.combine === 'points') {
    if (pointsTotal <= 0) return null;
    return {
      percent: (pointsEarned / pointsTotal) * 100,
      count: values.length,
      dropped: 0,
      guessed: component.items.some((item) => item.status === 'unknown'),
    };
  }

  let used = values;
  let dropped = 0;
  if (component.combine === 'drop-lowest' && component.dropLowest > 0) {
    const sorted = [...values].sort((a, b) => a - b);
    dropped = Math.min(component.dropLowest, Math.max(0, sorted.length - 1));
    used = sorted.slice(dropped);
  }

  const total = used.reduce((sum, value) => sum + value, 0);
  return {
    percent: total / used.length,
    count: used.length,
    dropped,
    guessed: component.items.some((item) => item.status === 'unknown'),
  };
}

function buildModel(input, options) {
  const components = (Array.isArray(input?.components) ? input.components : []).map(readComponent);
  const problems = [];
  const notices = [];
  const scale = Array.isArray(options?.scale) ? options.scale : EXAMPLE_SCALE;
  const passPercent = parseNumber(input?.passPercent);
  const minFinalPercent = parseNumber(input?.minFinalPercent);
  const empty = components.every((component) => component.items.length === 0 && component.weight === null);

  if (!empty) {
    if (!hasValue(input?.passPercent)) {
      problems.push({
        code: 'pass-missing',
        field: 'passPercent',
        message: 'Add the passing percentage you need to reach.',
        fix: 'Enter the number from your syllabus, like 75.',
      });
    } else if (Number.isNaN(passPercent)) {
      problems.push({
        code: 'pass-number',
        field: 'passPercent',
        message: 'The passing percentage needs to be a number.',
        fix: 'Try 75.',
      });
    } else if (passPercent < 0 || passPercent > 100) {
      problems.push({
        code: 'pass-range',
        field: 'passPercent',
        message: 'The passing percentage runs from 0 to 100.',
        fix: 'Most pass marks are between 60 and 80.',
      });
    }

    if (hasValue(input?.minFinalPercent)) {
      if (Number.isNaN(minFinalPercent)) {
        problems.push({
          code: 'minimum-number',
          field: 'minFinalPercent',
          message: 'The minimum on the final needs to be a number.',
          fix: 'Leave it blank if your course has no minimum.',
        });
      } else if (minFinalPercent < 0 || minFinalPercent > 100) {
        problems.push({
          code: 'minimum-range',
          field: 'minFinalPercent',
          message: 'The minimum on the final runs from 0 to 100.',
          fix: 'Leave it blank if there is no minimum.',
        });
      }
    }
  }

  components.forEach((component) => {
    const label = component.label;

    if (component.weight !== null) {
      if (Number.isNaN(component.weight)) {
        problems.push({
          code: 'weight-number',
          componentId: component.id,
          field: 'weight',
          message: `How much ${label} counts for needs to be a number.`,
          fix: 'Enter a percent, like 30.',
        });
      } else if (component.weight < 0 || component.weight > 100) {
        problems.push({
          code: 'weight-range',
          componentId: component.id,
          field: 'weight',
          message: `How much ${label} counts for runs from 0 to 100.`,
          fix: 'Check the number on your syllabus.',
        });
      }
    } else if (component.items.length > 0) {
      problems.push({
        code: 'weight-missing',
        componentId: component.id,
        field: 'weight',
        message: `How much does ${label} count for?`,
        fix: 'Check your syllabus, then enter the percent. The parts normally add up to 100.',
      });
    }

    component.items.forEach((item, itemIndex) => {
      const name = item.name || `${label} item ${itemIndex + 1}`;

      if (item.status === 'graded') {
        if (!hasValue(item.scoreRaw)) {
          problems.push({
            code: 'score-missing',
            componentId: component.id,
            itemId: item.id,
            field: 'score',
            message: `Add a score for ${name}, or leave both numbers blank if it hasn't been taken yet.`,
            fix: 'A blank score is not the same as zero.',
          });
        } else if (Number.isNaN(item.score)) {
          problems.push({
            code: 'score-number',
            componentId: component.id,
            itemId: item.id,
            field: 'score',
            message: `${name} has a score that is not a number.`,
            fix: 'Use digits, like 18.',
          });
        } else if (item.score < 0) {
          problems.push({
            code: 'score-negative',
            componentId: component.id,
            itemId: item.id,
            field: 'score',
            message: `${name} has a negative score.`,
            fix: 'Scores start at zero.',
          });
        } else if (!hasValue(item.totalRaw)) {
          problems.push({
            code: 'total-missing',
            componentId: component.id,
            itemId: item.id,
            field: 'total',
            message: `Add what ${name} is out of.`,
            fix: 'For 18 out of 20, the total is 20.',
          });
        } else if (Number.isNaN(item.total)) {
          problems.push({
            code: 'total-number',
            componentId: component.id,
            itemId: item.id,
            field: 'total',
            message: `${name} has a total that is not a number.`,
            fix: 'Use digits, like 20.',
          });
        } else if (item.total <= 0) {
          problems.push({
            code: 'total-zero',
            componentId: component.id,
            itemId: item.id,
            field: 'total',
            message: `${name} is out of zero.`,
            fix: 'Enter the number of points it was out of.',
          });
        } else if (item.score > item.total + EPSILON) {
          problems.push({
            code: 'score-over',
            componentId: component.id,
            itemId: item.id,
            field: 'score',
            message: `${name} has ${formatPoints(item.score)} out of ${formatPoints(item.total)}.`,
            fix: "The score can't be higher than the total. Check both numbers.",
          });
        }
      }

      if (item.status === 'unknown' && component.combine === 'points') {
        if (!hasValue(item.totalRaw) || Number.isNaN(item.total) || item.total <= 0) {
          problems.push({
            code: 'unknown-total',
            componentId: component.id,
            itemId: item.id,
            field: 'total',
            message: `Add what ${name} is out of, so a guess can be used.`,
            fix: 'This part adds up points, so the total matters.',
          });
        }
      }
    });

    if (component.combine === 'drop-lowest') {
      const scoreable = component.items.filter((item) => item.status !== 'pending').length;
      if (scoreable > 0 && component.dropLowest >= scoreable) {
        problems.push({
          code: 'drop-all',
          componentId: component.id,
          field: 'dropLowest',
          message: `You're dropping all of ${label}'s scores.`,
          fix: 'Drop fewer, or combine them by average instead.',
        });
      }
    }

    if (component.items.length > 0 && component.weight === 0) {
      notices.push({
        code: 'zero-weight',
        componentId: component.id,
        message: `${label} counts for 0%, so it does not change the answer.`,
      });
    }
  });

  const totalWeight = components.reduce(
    (sum, component) => sum + (Number.isFinite(component.weight) ? component.weight : 0),
    0,
  );

  return {
    components,
    problems,
    notices,
    scale,
    empty,
    passPercent,
    minFinalPercent: hasValue(input?.minFinalPercent) ? minFinalPercent : null,
    totalWeight,
    solveFor: typeof input?.solveFor === 'string' ? input.solveFor : null,
  };
}

function targetName(target) {
  if (target.implicit) return 'final';
  return (target.name || 'part').toLowerCase().replace(/^the\s+/, '');
}

/** "the final", "the final and project", "the final, project and lab". */
function describeTargets(targets) {
  if (targets.length === 0) return 'what is left';
  const names = targets.map(targetName);
  if (names.length === 1) return `the ${names[0]}`;
  if (names.length === 2) return `the ${names[0]} and ${names[1]}`;
  return `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function describeUnknown(items) {
  const names = [];
  for (const item of items) {
    if (!names.includes(item.componentName)) names.push(item.componentName);
  }
  if (names.length === 0) return 'that part';
  if (names.length === 1) return `the ${names[0]}`;
  return `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function unknownItemList(model) {
  const list = [];
  model.components.forEach((component) => {
    component.items.forEach((item) => {
      if (item.status !== 'unknown') return;
      list.push({
        componentId: component.id,
        componentName: targetName({ name: component.label }),
        itemId: item.id,
        itemName: item.name,
      });
    });
  });
  return list;
}

/** The weighted average of work that already has a score, for a first guess. */
function defaultGuess(model) {
  let earned = 0;
  let weight = 0;
  for (const component of model.components) {
    if (!Number.isFinite(component.weight) || component.weight <= 0) continue;
    if (!component.items.some((item) => item.status === 'graded')) continue;
    const result = componentPercent(component, null);
    if (!result) continue;
    earned += (result.percent * component.weight) / 100;
    weight += component.weight;
  }
  return weight > 0 ? clamp((earned / weight) * 100, 0, 100) : DEFAULT_GUESS_PERCENT;
}

const BASE = {
  status: 'empty',
  passPercent: null,
  minFinalPercent: null,
  totalWeight: 0,
  gradedWeight: 0,
  targetWeight: 0,
  earnedPercent: null,
  standingPercent: null,
  floorPercent: null,
  floorScale: null,
  bestPercent: null,
  bestScale: null,
  neededPercent: null,
  rawNeededPercent: null,
  neededScale: null,
  minimumApplied: false,
  passed: null,
  primaryTargetId: null,
  targets: [],
  descriptor: 'what is left',
  sentence: '',
  detail: null,
  short: '',
  steps: [],
  problems: [],
  notices: [],
  unknownItems: [],
  scenarios: null,
  guess: null,
};

/**
 * One full answer for a given guess (or null when nothing needs guessing).
 */
function run(model, guess) {
  const rows = model.components.map((component) => ({
    component,
    result: component.items.length > 0 ? componentPercent(component, guess) : null,
  }));

  let gradedWeight = 0;
  let earned = 0;
  const ungraded = [];

  rows.forEach(({ component, result }) => {
    if (result === null) {
      ungraded.push(component);
    } else {
      gradedWeight += component.weight;
      earned += (result.percent * component.weight) / 100;
    }
  });

  const leftover = 100 - model.totalWeight;
  const targets = [];
  if (leftover > WEIGHT_TOLERANCE) {
    targets.push({ id: '__final', name: 'final', weight: round(leftover, 4), implicit: true });
  }
  ungraded.forEach((component) => {
    targets.push({
      id: component.id,
      name: component.label,
      weight: component.weight,
      implicit: false,
    });
  });

  const targetWeight = 100 - gradedWeight;
  const descriptor = describeTargets(targets);
  const primaryTargetId =
    targets.find((target) => target.id === model.solveFor)?.id ?? targets[0]?.id ?? null;
  const bestPercent = Math.min(100, earned + targetWeight);
  const floorPercent = earned;
  const standingPercent = gradedWeight > 0 ? earned / (gradedWeight / 100) : null;
  const pass = model.passPercent;
  const min = Number.isFinite(model.minFinalPercent) ? model.minFinalPercent : null;
  const notices = [...model.notices];

  if (leftover > WEIGHT_TOLERANCE && targets.length > 0) {
    notices.push({
      code: 'leftover',
      message: `Your parts add up to ${formatPercent(model.totalWeight)}. The other ${formatPercent(
        leftover,
      )} is counted with ${descriptor}.`,
    });
  }

  const shared = {
    ...BASE,
    passPercent: pass,
    minFinalPercent: min,
    totalWeight: model.totalWeight,
    gradedWeight,
    targetWeight,
    earnedPercent: earned,
    standingPercent,
    floorPercent,
    floorScale: percentToScale(floorPercent, model.scale),
    bestPercent,
    bestScale: percentToScale(bestPercent, model.scale),
    primaryTargetId,
    targets,
    descriptor,
    problems: model.problems,
    notices,
    unknownItems: unknownItemList(model),
  };

  if (targets.length === 0) {
    const passed = earned >= pass - EPSILON;
    const sentence = `Your course grade is ${formatPercent(earned)}.`;
    return {
      ...shared,
      status: 'complete',
      neededPercent: 0,
      rawNeededPercent: 0,
      neededScale: percentToScale(earned, model.scale),
      passed,
      sentence,
      detail: passed
        ? `That clears your ${formatPercent(pass)} pass mark.`
        : `That is below your ${formatPercent(pass)} pass mark.`,
      short: `your course grade is ${formatPercent(earned, 0)}`,
      steps: [
        'Every part has a score, and the parts add up to 100%.',
        `The weighted scores add up to ${formatPercent(earned)}.`,
        `Your pass mark is ${formatPercent(pass)}.`,
      ],
    };
  }

  const rawNeededPercent = targetWeight > EPSILON ? ((pass - earned) / targetWeight) * 100 : null;

  if (rawNeededPercent === null) {
    return {
      ...shared,
      status: 'empty',
      sentence: 'Nothing to solve yet.',
      detail: 'Add one grade you already have.',
      steps: [],
    };
  }

  if (rawNeededPercent > 100 + EPSILON) {
    const gap = pass - bestPercent;
    return {
      ...shared,
      status: 'impossible',
      rawNeededPercent,
      sentence: `The best you can still get is ${formatPercent(bestPercent)}.`,
      detail: `That is ${formatPoints(gap)} points short of ${formatPercent(pass)}.`,
      short: `the best you can get is ${formatPercent(bestPercent, 0)}`,
      steps: [
        gradedWeight > 0
          ? `Your graded work is ${formatPercent(gradedWeight)} of the course and has earned ${formatPoints(
              earned,
            )} of the 100 points.`
          : 'Nothing is graded yet.',
        `A perfect 100% on ${descriptor} adds ${formatPoints(targetWeight)} points, for a best case of ${formatPercent(
          bestPercent,
        )}.`,
        `You need ${formatPercent(pass)}. That leaves a gap of ${formatPoints(gap)} points.`,
        `No score on ${descriptor} can close that gap this term.`,
      ],
    };
  }

  if (rawNeededPercent <= EPSILON) {
    const minimumApplied = min !== null && min > 0;
    const sentence = minimumApplied
      ? `You're already above ${formatPercent(pass)}, but your course needs at least ${formatPercent(min)} on ${descriptor}.`
      : `You've already reached your ${formatPercent(pass)} pass mark.`;
    return {
      ...shared,
      status: 'reached',
      neededPercent: minimumApplied ? min : 0,
      rawNeededPercent,
      neededScale: minimumApplied ? percentToScale(min, model.scale) : null,
      minimumApplied,
      passed: true,
      sentence,
      detail: `Even a 0% on ${descriptor} leaves you at ${formatPercent(earned)}.`,
      short: minimumApplied
        ? `your course still needs at least ${formatPercent(min, 0)} on ${descriptor}`
        : 'you have already passed',
      steps: [
        `Your graded work is ${formatPercent(gradedWeight)} of the course and has earned ${formatPoints(
          earned,
        )} of the 100 points.`,
        `That is already at or above your ${formatPercent(pass)} pass mark.`,
        `Even 0% on ${descriptor} leaves you at ${formatPercent(earned)}.`,
        ...(minimumApplied
          ? [`Your course also asks for at least ${formatPercent(min)} on ${descriptor}.`]
          : []),
      ],
    };
  }

  const minimumApplied = min !== null && min > rawNeededPercent + EPSILON;
  const neededPercent = minimumApplied ? min : rawNeededPercent;
  const neededPoints = pass - earned;
  const neededScale = percentToScale(neededPercent, model.scale);
  const sentence = minimumApplied
    ? `Your course needs at least ${formatPercent(min)} on ${descriptor}.`
    : `You need about ${formatPercent(neededPercent, 0)} on ${descriptor} to pass.`;
  const averageNote =
    targets.length > 1
      ? ` ${formatPercent(rawNeededPercent, 0)} is the average across ${descriptor}; each one lands in the same place if they all hit it.`
      : '';

  return {
    ...shared,
    status: 'need',
    neededPercent,
    rawNeededPercent,
    neededScale,
    minimumApplied,
    sentence,
    detail:
      minimumApplied
        ? `The grades alone would need ${formatPercent(rawNeededPercent)}. Your course's minimum is higher.`
        : `${formatPercent(neededPercent)} is about ${formatScale(neededScale)} on the example 1.0–5.0 scale.`,
    short: minimumApplied
      ? `you need at least ${formatPercent(min, 0)} on ${descriptor}`
      : `you need about ${formatPercent(neededPercent, 0)} on ${descriptor} to pass`,
    steps: [
      gradedWeight > 0
        ? `Your graded work is ${formatPercent(gradedWeight)} of the course and has earned ${formatPoints(
            earned,
          )} of the 100 points.`
        : 'Nothing is graded yet, so the whole grade rests on what is left.',
      gradedWeight > 0
        ? `To reach ${formatPercent(pass)}, you need ${formatPoints(neededPoints)} more points.`
        : `You need ${formatPoints(neededPoints)} of the 100 points to reach ${formatPercent(pass)}.`,
      `${capitalize(descriptor)} is worth ${formatPercent(targetWeight)} of the course.`,
      `${formatPoints(neededPoints)} ÷ ${formatPercent(targetWeight)} × 100 = ${formatPercent(
        rawNeededPercent,
      )}. That is the score needed on ${descriptor}.${averageNote}`,
      ...(minimumApplied
        ? [
            `Your course also needs at least ${formatPercent(min)} on ${descriptor}, so aim for ${formatPercent(
              min,
            )}.`,
          ]
        : []),
      `${formatPercent(neededPercent)} is about ${formatScale(neededScale)} on the example 1.0–5.0 scale.`,
    ],
  };
}

function scenarioPlan(model, options) {
  const requested = Number(options?.guessPercent);
  const middle = clamp(Number.isFinite(requested) ? requested : defaultGuess(model), 0, 100);
  const spread =
    Number.isFinite(Number(options?.guessSpread)) && Number(options.guessSpread) > 0
      ? Number(options.guessSpread)
      : GUESS_SPREAD;
  const levels = [
    { key: 'low', guessPercent: clamp(middle - spread, 0, 100) },
    { key: 'middle', guessPercent: middle },
    { key: 'high', guessPercent: clamp(middle + spread, 0, 100) },
  ];

  const unknownItems = unknownItemList(model);
  const phrase = describeUnknown(unknownItems);

  const scenarios = levels.map((level) => {
    const result = run(model, level.guessPercent);
    return {
      key: level.key,
      guessPercent: level.guessPercent,
      label: `${formatPercent(level.guessPercent, 0)} guess`,
      status: result.status,
      neededPercent: result.neededPercent,
      neededScale: result.neededScale,
      bestPercent: result.bestPercent,
      sentence: `With ${phrase} at ${formatPercent(level.guessPercent, 0)}, ${result.short}.`,
      result,
    };
  });

  const middleResult = scenarios[1].result;

  return {
    ...middleResult,
    status: 'scenarios',
    neededPercent: null,
    neededScale: null,
    scenarios,
    guess: {
      middle,
      low: levels[0].guessPercent,
      high: levels[2].guessPercent,
      spread,
    },
    sentence: 'There is no single answer yet.',
    detail: `${capitalize(phrase)} ${
      unknownItems.length > 1 ? 'have' : 'has'
    } no visible score, so the answer depends on your guess.`,
    short: 'the answer depends on one score you cannot see',
    steps: [
      'One or more scores are not visible yet, so there is no single answer.',
      `Each version below uses a different guess for ${phrase}.`,
      'Change the guess to see how much the answer moves.',
    ],
  };
}

function invalidPlan(model) {
  const first = model.problems[0];
  return {
    ...BASE,
    status: 'invalid',
    passPercent: Number.isFinite(model.passPercent) ? model.passPercent : null,
    minFinalPercent: model.minFinalPercent,
    totalWeight: model.totalWeight,
    problems: model.problems,
    notices: model.notices,
    sentence: first.message,
    detail: first.fix ?? null,
    steps: [],
  };
}

function emptyPlan() {
  return {
    ...BASE,
    status: 'empty',
    sentence: 'Start with a grade you already have.',
    detail: 'Add one score, what it was out of, and how much it counts for. The answer appears as soon as there is enough to work with.',
    steps: [
      'Start with one grade you already have.',
      'Add what it was out of, and how much it counts for.',
      'Then set the percentage you need to pass.',
    ],
  };
}

function weightsOverPlan(model) {
  const excess = model.totalWeight - 100;
  return {
    ...BASE,
    status: 'weights-over',
    passPercent: model.passPercent,
    minFinalPercent: model.minFinalPercent,
    totalWeight: model.totalWeight,
    problems: model.problems,
    notices: model.notices,
    sentence: `Your parts add up to ${formatPercent(model.totalWeight)}.`,
    detail: `That is ${formatPercent(excess)} too much.`,
    short: `your parts add up to ${formatPercent(model.totalWeight, 0)}`,
    steps: [
      `Your parts add up to ${formatPercent(model.totalWeight)}.`,
      `That is ${formatPercent(excess)} more than 100%.`,
      `Take ${formatPercent(excess)} off one part, or check the numbers on your syllabus.`,
    ],
  };
}

/**
 * Work out what the student needs.
 *
 * @param {object} input
 * @param {string|number} input.passPercent        the student's own pass mark, 0-100
 * @param {string|number} [input.minFinalPercent]  optional floor on the final score
 * @param {Array} [input.components]               parts, each with weight + items
 * @param {string} [input.solveFor]                component id to label first
 * @param {object} [options]
 * @param {number} [options.guessPercent]          middle guess for "unknown" items
 * @param {number} [options.guessSpread]           low/high distance, default 15
 * @param {Array}  [options.scale]                 {grade, percent} points
 * @returns {object} a plan: status, sentence, steps, numbers, problems
 */
export function calculatePlan(input = {}, options = {}) {
  const model = buildModel(input, options);

  if (model.problems.length > 0) return invalidPlan(model);
  if (model.empty) return emptyPlan();
  if (model.totalWeight > 100 + WEIGHT_TOLERANCE) return weightsOverPlan(model);

  const unknownItems = unknownItemList(model);
  if (unknownItems.length > 0) return scenarioPlan(model, options);

  return run(model, null);
}

/** Re-exported so the UI has one import for scale work. */
export { EXAMPLE_SCALE, percentToScale, scaleToPercent };
