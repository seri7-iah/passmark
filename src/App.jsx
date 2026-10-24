import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calculatePlan,
  formatPercent,
  formatPoints,
  formatScale,
  parseNumber,
} from './engine.js';

const STORAGE_KEY = 'passmark.draft.v2';
const MAX_PARTS = 8;
const TOTAL_STEPS = 3;

const STEP_TITLES = {
  1: "Your school's passing percentage",
  2: 'Your grades so far',
  3: 'What do you want to find out?',
};

const asText = (value) => (value === null || value === undefined ? '' : String(value));
const hasValue = (value) => asText(value).trim() !== '';
const partHasNumbers = (part) =>
  hasValue(part.weight) || hasValue(part.score) || hasValue(part.total);

const newId = () => `p-${Math.random().toString(36).slice(2, 9)}`;

function makePart(fields = {}) {
  return { id: newId(), name: '', score: '', total: '', weight: '', ...fields };
}

function blankDraft() {
  return {
    step: 1,
    passPercent: '',
    minFinalPercent: '',
    parts: [makePart(), makePart()],
    solveFor: '__final',
    example: false,
  };
}

function storageWorks() {
  if (typeof window === 'undefined') return false;
  try {
    const key = 'passmark.check';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const canStore = storageWorks();

function loadDraft() {
  if (typeof window === 'undefined') return blankDraft();
  try {
    window.localStorage.removeItem('passmark.draft.v1');
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankDraft();
    const saved = JSON.parse(raw);
    const parts = Array.isArray(saved?.parts)
      ? saved.parts.slice(0, MAX_PARTS).map((part) => ({
          id: typeof part?.id === 'string' && part.id ? part.id : newId(),
          name: asText(part?.name).slice(0, 60),
          score: asText(part?.score),
          total: asText(part?.total),
          weight: asText(part?.weight),
        }))
      : [];

    return {
      step: [1, 2, 3].includes(saved?.step) ? saved.step : 1,
      passPercent: asText(saved?.passPercent),
      minFinalPercent: asText(saved?.minFinalPercent),
      parts: parts.length > 0 ? parts : [makePart(), makePart()],
      solveFor: typeof saved?.solveFor === 'string' ? saved.solveFor : '__final',
      example: saved?.example === true,
    };
  } catch {
    return blankDraft();
  }
}

/** A blank or 0-100 percentage, with a sentence for each way it can be wrong. */
function checkPercent(raw, copy) {
  if (!hasValue(raw)) return null;
  const value = parseNumber(raw);
  if (Number.isNaN(value)) return { message: copy.number, fix: copy.numberFix };
  if (value < 0 || value > 100) return { message: copy.range, fix: copy.rangeFix };
  return null;
}

function problemFor(problems, field, componentId) {
  return (
    problems.find(
      (problem) =>
        problem.field === field &&
        (componentId === undefined || problem.componentId === componentId),
    ) ?? null
  );
}

function budgetText(plan) {
  if (plan.problems.some((problem) => problem.field === 'weight')) {
    return 'Fix the marked count and the coverage appears here.';
  }
  const total = plan.totalWeight;
  if (total > 100.01) {
    return `These add up to ${formatPercent(total)}. Take ${formatPercent(
      total - 100,
      0,
    )} off one part.`;
  }
  if (total === 0) {
    return 'Nothing counted yet. Whatever is left over is the final exam.';
  }
  if (total >= 99.99) {
    return 'This covers 100% of your grade. Nothing is left over.';
  }
  return `This covers ${formatPercent(total)}. The final exam is the other ${formatPercent(
    100 - total,
  )}.`;
}

/* ---------- the visual answer: a 100-point course strip ---------- */

const clampPercent = (value) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
const almostEqual = (a, b) => Math.abs(a - b) < 0.05;
const pointsText = (value) =>
  `${formatPoints(value)} ${almostEqual(value, 1) ? 'point' : 'points'}`;

/**
 * The three words the page uses for how the target sits. "Tough" is not a
 * school policy: it means the final has to score above the student's own pass
 * mark. "Not reachable" means even 100% falls short.
 */
function resultState(plan) {
  const pass = Number.isFinite(plan.passPercent) ? formatPercent(plan.passPercent) : '';

  if (plan.status === 'need') {
    if (almostEqual(plan.neededPercent, plan.passPercent)) {
      return { key: 'reachable', word: 'Reachable', note: `At your ${pass} pass mark.` };
    }
    if (plan.neededPercent < plan.passPercent) {
      return { key: 'reachable', word: 'Reachable', note: `Under your ${pass} pass mark.` };
    }
    return { key: 'tough', word: 'Tough', note: `Still possible — over your ${pass} pass mark.` };
  }
  if (plan.status === 'reached') {
    return {
      key: 'reached',
      word: 'Reached',
      note: plan.minimumApplied ? 'The course minimum still applies.' : '',
    };
  }
  if (plan.status === 'impossible') return { key: 'out', word: 'Not reachable', note: '' };
  if (plan.status === 'complete') {
    return plan.passed
      ? { key: 'reached', word: 'Passed', note: '' }
      : { key: 'out', word: 'Missed', note: '' };
  }
  if (plan.status === 'weights-over') return { key: 'check', word: 'Check the parts', note: '' };
  if (plan.status === 'invalid') return { key: 'check', word: 'Check your entries', note: '' };
  if (plan.status === 'scenarios') {
    return { key: 'waiting', word: 'Depends', note: 'One score is not visible.' };
  }
  return { key: 'waiting', word: 'Not yet', note: '' };
}

function answerFigure(plan) {
  if (plan.status === 'need' || plan.status === 'reached') {
    return {
      value: formatPercent(plan.neededPercent, 0).replace('%', ''),
      unit: '%',
      label: plan.minimumApplied
        ? 'minimum on the final'
        : plan.targets.length > 1
          ? 'needed on average'
          : 'needed on the final',
    };
  }
  if (plan.status === 'impossible') {
    return {
      value: formatPercent(plan.bestPercent, 1).replace('%', ''),
      unit: '%',
      label: 'the best possible',
    };
  }
  if (plan.status === 'complete') {
    return {
      value: formatPercent(plan.earnedPercent, 1).replace('%', ''),
      unit: '%',
      label: 'your course grade',
    };
  }
  return null;
}

function answerTarget(plan) {
  if (plan.status === 'complete') return 'Every part is scored';
  if (plan.targets.length === 0) return '';
  if (plan.targets.length === 1) {
    const target = plan.targets[0];
    const name = target.implicit ? 'Final exam' : target.name || 'This part';
    return `${name} · ${formatPercent(target.weight)} of your grade`;
  }
  return `${plan.targets.length} open parts · ${formatPercent(
    plan.targetWeight,
  )} of your grade, averaged`;
}

/** Banked, still open, and already lost points, on a 0-100 course bar. */
function courseStrip(plan) {
  if (!Number.isFinite(plan.earnedPercent)) return null;
  if (!['need', 'reached', 'impossible', 'complete'].includes(plan.status)) return null;
  const earned = clampPercent(plan.earnedPercent);
  const best = clampPercent(Number.isFinite(plan.bestPercent) ? plan.bestPercent : earned);
  const needed = Number.isFinite(plan.neededPercent) ? plan.neededPercent : 0;
  const aim = clampPercent(earned + (plan.targetWeight * needed) / 100);
  return {
    earned,
    open: clampPercent(best - earned),
    lost: clampPercent(100 - best),
    best,
    pass: clampPercent(plan.passPercent),
    aim,
  };
}

function bracketFor(plan, strip) {
  let from = strip.earned;
  let to = strip.pass;
  if (plan.status === 'impossible') {
    from = strip.best;
    to = strip.pass;
  } else if (plan.minimumApplied && (plan.status === 'need' || plan.status === 'reached')) {
    // The course minimum can sit above the pass mark; draw the real target.
    from = strip.earned;
    to = strip.aim;
  } else if (plan.status === 'reached' || (plan.status === 'complete' && plan.passed)) {
    from = strip.pass;
    to = strip.earned;
  }
  if (to - from < 3) return null;
  return { from: clampPercent(from), to: clampPercent(to) };
}

function stripCaption(plan, strip) {
  const { earned, open, pass, best } = strip;
  if (plan.status === 'need') {
    if (plan.minimumApplied) return `Your minimum sets the target · ${formatPoints(open)} still open`;
    return `${pointsText(pass - earned)} to go · ${formatPoints(open)} still open`;
  }
  if (plan.status === 'impossible') {
    return `${pointsText(pass - best)} short of your ${formatPercent(pass)} pass mark`;
  }
  if (plan.status === 'reached') {
    if (plan.minimumApplied) {
      return `Your course also needs ${formatPercent(plan.neededPercent)} on the final.`;
    }
    const cushion = earned - pass;
    return almostEqual(cushion, 0)
      ? `At your pass mark · ${formatPoints(open)} still open`
      : `${pointsText(cushion)} above your pass mark · ${formatPoints(open)} still open`;
  }
  if (plan.status === 'complete') {
    if (plan.passed) {
      const cushion = earned - pass;
      return almostEqual(cushion, 0)
        ? 'At your pass mark · course finished'
        : `${pointsText(cushion)} above your pass mark · course finished`;
    }
    return `${pointsText(pass - earned)} short · course finished`;
  }
  return '';
}

function stripDescription(plan, strip) {
  const { earned, open, lost, pass, best } = strip;
  const bits = [
    'Course bar, 100 points.',
    `${formatPoints(earned)} earned.`,
    open > 0.05 ? `${formatPoints(open)} still open.` : '',
    lost > 0.05
      ? `${formatPoints(lost)} ${plan.status === 'impossible' ? 'out of reach' : 'not earned'}.`
      : '',
    `Pass mark at ${formatPercent(pass)}.`,
  ];
  if (plan.status === 'impossible') bits.push(`Best possible ${formatPoints(best)}.`);
  if (plan.minimumApplied) {
    bits.push(
      `Your course minimum is ${formatPercent(plan.neededPercent)} on the final.`,
    );
  }
  return bits.filter(Boolean).join(' ');
}

function CourseStrip({ plan, strip, caption }) {
  const bracket = bracketFor(plan, strip);
  const isOut = plan.status === 'impossible' || (plan.status === 'complete' && !plan.passed);
  const lostLabel = plan.status === 'impossible' ? 'Out of reach' : 'Not earned';
  const passEdge = strip.pass < 10 ? ' is-start' : strip.pass > 90 ? ' is-end' : '';

  return (
    <div className="strip">
      <p className="strip-head">Your course, out of 100 points</p>
      <div className="strip-plot">
        <div className="strip-bar">
          <div
            className="strip-track"
            role="img"
            aria-label={stripDescription(plan, strip)}
          >
            {strip.earned > 0.05 ? (
              <span
                className="strip-seg strip-seg--earned"
                style={{ width: `${strip.earned}%` }}
              >
                {strip.earned >= 26 ? `Earned ${formatPoints(strip.earned)}` : ''}
              </span>
            ) : null}
            {strip.open > 0.05 ? (
              <span className="strip-seg strip-seg--open" style={{ width: `${strip.open}%` }}>
                {strip.open >= 22 ? `Open ${formatPoints(strip.open)}` : ''}
              </span>
            ) : null}
            {strip.lost > 0.05 ? (
              <span className="strip-seg strip-seg--lost" style={{ width: `${strip.lost}%` }}>
                {strip.lost >= 26 ? lostLabel : ''}
              </span>
            ) : null}
          </div>

          {bracket ? (
            <span
              className={isOut ? 'strip-bracket is-out' : 'strip-bracket'}
              style={{ left: `${bracket.from}%`, width: `${bracket.to - bracket.from}%` }}
              aria-hidden="true"
            />
          ) : null}

          <span
            className={`pass-flag${passEdge}`}
            style={{ left: `${strip.pass}%` }}
            aria-hidden="true"
          >
            <span className="pass-line" />
            <span className="pass-label">Pass {formatPercent(strip.pass)}</span>
          </span>
        </div>
      </div>
      <p className="strip-caption">{caption}</p>
    </div>
  );
}

/** The top band: one sentence in the student's own terms, plus a way to check it. */
function buildAnswer(plan, draft) {
  if (plan.status === 'empty') {
    if (!hasValue(draft.passPercent)) {
      return {
        sentence: 'Start with your pass mark.',
        detail: "It's the percentage you need to reach to pass. Your syllabus has it.",
        scale: '',
      };
    }
    return {
      sentence: 'Now add the grades you already have.',
      detail: 'Add one part, with the score you got and how much it counts for.',
      scale: '',
    };
  }

  if (plan.status === 'invalid') {
    return { sentence: plan.sentence, detail: plan.detail, scale: '' };
  }

  if (plan.status === 'weights-over') {
    return {
      sentence: plan.sentence,
      detail: `${plan.detail} Take ${formatPercent(plan.totalWeight - 100, 0)} off one part.`,
      scale: '',
    };
  }

  let scale = '';
  if (plan.status === 'impossible' && Number.isFinite(plan.bestScale)) {
    scale = `The best case is about ${formatScale(
      plan.bestScale,
    )} on the example 1.0–5.0 scale.`;
  } else if (plan.status === 'reached' && plan.minimumApplied && Number.isFinite(plan.neededScale)) {
    scale = `${formatPercent(plan.neededPercent)} is about ${formatScale(
      plan.neededScale,
    )} on the example 1.0–5.0 scale.`;
  } else if (plan.status === 'reached' && Number.isFinite(plan.floorScale)) {
    scale = `The guaranteed ${formatPercent(
      plan.earnedPercent,
    )} is about ${formatScale(plan.floorScale)} on the example 1.0–5.0 scale.`;
  } else if (plan.status === 'complete' && Number.isFinite(plan.neededScale)) {
    scale = `That is about ${formatScale(plan.neededScale)} on the example 1.0–5.0 scale.`;
  } else if (
    plan.status === 'need' &&
    plan.minimumApplied &&
    Number.isFinite(plan.neededScale)
  ) {
    scale = `${formatPercent(plan.neededPercent)} is about ${formatScale(
      plan.neededScale,
    )} on the example 1.0–5.0 scale.`;
  }

  const detail =
    plan.status === 'reached' && plan.minimumApplied
      ? `The pass mark is safe. The ${formatPercent(
          plan.minFinalPercent,
        )} minimum still applies.`
      : plan.detail;

  return { sentence: plan.sentence, detail, scale };
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export default function App() {
  const [draft, setDraft] = useState(loadDraft);
  const [announcement, setAnnouncement] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const headingRef = useRef(null);
  const howRef = useRef(null);
  const resultRef = useRef(null);
  const answerHeadingRef = useRef(null);
  const focusAnswerRef = useRef(false);
  const addButtonRef = useRef(null);
  const focusPartRef = useRef(null);
  const focusAddRef = useRef(false);
  const focusHeadingRef = useRef(false);
  const previousStep = useRef(draft.step);
  const firstAnnounce = useRef(true);

  const components = useMemo(
    () =>
      draft.parts.filter(partHasNumbers).map((part) => ({
        id: part.id,
        name: part.name,
        weight: part.weight,
        combine: 'average',
        items: [
          {
            id: `${part.id}-score`,
            name: part.name,
            status: !hasValue(part.score) && !hasValue(part.total) ? 'pending' : 'graded',
            score: part.score,
            total: part.total,
          },
        ],
      })),
    [draft.parts],
  );

  const plan = useMemo(
    () =>
      calculatePlan({
        passPercent: draft.passPercent,
        minFinalPercent: draft.minFinalPercent,
        components,
        solveFor: draft.solveFor,
      }),
    [draft.passPercent, draft.minFinalPercent, components, draft.solveFor],
  );

  const answer = useMemo(() => buildAnswer(plan, draft), [plan, draft]);
  const state = useMemo(() => resultState(plan), [plan]);
  const figure = useMemo(() => answerFigure(plan), [plan]);
  const strip = useMemo(() => courseStrip(plan), [plan]);
  const caption = strip ? stripCaption(plan, strip) : '';
  const targetText = answerTarget(plan);
  const showSteps = plan.steps.length > 0 && plan.status !== 'empty' && plan.status !== 'invalid';

  const passProblem = useMemo(
    () =>
      checkPercent(draft.passPercent, {
        number: 'Your pass mark needs to be a number.',
        numberFix: 'Try 75.',
        range: 'Your pass mark runs from 0 to 100.',
        rangeFix: 'Use the number from your syllabus.',
      }),
    [draft.passPercent],
  );

  const minimumProblem = useMemo(
    () =>
      checkPercent(draft.minFinalPercent, {
        number: 'The minimum on the final needs to be a number.',
        numberFix: 'Leave it blank if your course has no minimum.',
        range: 'The minimum runs from 0 to 100.',
        rangeFix: 'Leave it blank if there is no minimum.',
      }),
    [draft.minFinalPercent],
  );

  const partProblems = plan.problems.filter((problem) => problem.componentId);
  const hasUsablePart = draft.parts.some(partHasNumbers);
  const overBudget = plan.totalWeight > 100.01;
  const nothingToFind = plan.status === 'complete' && plan.targets.length === 0;
  const passReady = hasValue(draft.passPercent) && !passProblem && !minimumProblem;
  const gradesReady =
    hasUsablePart && partProblems.length === 0 && !overBudget && !nothingToFind;

  const selectedTarget = plan.targets.some((target) => target.id === draft.solveFor)
    ? draft.solveFor
    : plan.primaryTargetId;

  const announceText = [state.word, state.note, answer.sentence, answer.detail, answer.scale]
    .filter(Boolean)
    .join('. ');

  useEffect(() => {
    if (previousStep.current === draft.step) return;
    previousStep.current = draft.step;
    const node = headingRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [draft.step]);

  useEffect(() => {
    if (!focusHeadingRef.current) return;
    focusHeadingRef.current = false;
    const node = headingRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [draft]);

  useEffect(() => {
    if (!focusAnswerRef.current) return;
    focusAnswerRef.current = false;
    answerHeadingRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [draft]);

  useEffect(() => {
    if (!canStore) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* Private mode or a full quota. The page still works, it just forgets. */
    }
  }, [draft]);

  useEffect(() => {
    if (firstAnnounce.current) {
      firstAnnounce.current = false;
      return undefined;
    }
    const timer = setTimeout(() => setAnnouncement(announceText), 800);
    return () => clearTimeout(timer);
  }, [announceText]);

  useEffect(() => {
    if (!confirmReset) return undefined;
    const timer = setTimeout(() => setConfirmReset(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  useEffect(() => {
    const id = focusPartRef.current;
    if (id) {
      focusPartRef.current = null;
      document.getElementById(`name-${id}`)?.focus();
      return;
    }
    if (focusAddRef.current) {
      focusAddRef.current = false;
      addButtonRef.current?.focus();
    }
  }, [draft.parts]);

  function editDraft(mutator) {
    setDraft((current) => ({ ...mutator(current), example: false }));
  }

  function updatePart(id, field, value) {
    editDraft((current) => ({
      ...current,
      parts: current.parts.map((part) => (part.id === id ? { ...part, [field]: value } : part)),
    }));
  }

  function addPart() {
    if (draft.parts.length >= MAX_PARTS) return;
    const part = makePart();
    focusPartRef.current = part.id;
    editDraft((current) => ({ ...current, parts: [...current.parts, part] }));
  }

  function removePart(id) {
    focusAddRef.current = true;
    editDraft((current) => {
      const parts = current.parts.filter((part) => part.id !== id);
      return { ...current, parts: parts.length > 0 ? parts : [makePart()] };
    });
  }

  function goToStep(step) {
    setDraft((current) => ({ ...current, step }));
  }

  function tryExample() {
    previousStep.current = 3;
    focusAnswerRef.current = true;
    setDraft({
      step: 3,
      passPercent: '75',
      minFinalPercent: '',
      parts: [
        makePart({ name: 'Prelim', score: '85', total: '100', weight: '30' }),
        makePart({ name: 'Midterm', score: '80', total: '100', weight: '30' }),
      ],
      solveFor: '__final',
      example: true,
    });
  }

  function clearExample() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Nothing to clear. */
    }
    previousStep.current = 1;
    focusHeadingRef.current = true;
    setDraft(blankDraft());
  }

  function handleStartOver() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Nothing to clear. */
    }
    previousStep.current = 1;
    focusHeadingRef.current = true;
    setDraft(blankDraft());
  }

  function revealSteps() {
    const node = howRef.current;
    if (!node) return;
    node.open = true;
    node.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
    node.querySelector('summary')?.focus({ preventScroll: true });
  }

  let stepOneWhy = '';
  if (!hasValue(draft.passPercent)) stepOneWhy = 'Enter your pass mark to continue.';
  else if (passProblem || minimumProblem) stepOneWhy = 'Fix the marked field to continue.';

  let stepTwoWhy = '';
  if (!hasUsablePart) stepTwoWhy = 'Add one part you already have a score for.';
  else if (nothingToFind) stepTwoWhy = 'Every part has a score. There is nothing left to find out.';
  else if (overBudget) {
    stepTwoWhy = 'Bring the total down to 100% to continue.';
  } else if (partProblems.length > 0) {
    stepTwoWhy = 'Fix the marked fields to continue.';
  }

  return (
    <>
      <a className="skip-link" href="#calculator">
        Skip to the answer and the steps
      </a>

      <header className="masthead">
        <div className="wrap">
          <div className="masthead-row">
            <span className="brand">Passmark</span>
            <span className={canStore ? 'save-state' : 'save-state save-state--off'}>
              {canStore ? 'Saved in this browser' : 'This browser is not saving entries'}
            </span>
          </div>
          <h1>What you need on the final.</h1>
          <p className="lede">
            Put in your pass mark and the grades you already have. Passmark works out what the final
            still needs.
          </p>
        </div>
      </header>

      <main id="calculator" tabIndex={-1}>
        <section className="result" aria-labelledby="answer-label" ref={resultRef}>
          <div className="wrap">
            <h2
              className="visually-hidden"
              id="answer-label"
              tabIndex={-1}
              ref={answerHeadingRef}
            >
              Your answer
            </h2>

            {draft.example ? (
              <div className="example-note">
                <p>These are example numbers, not yours.</p>
                <button type="button" className="btn-link" onClick={clearExample}>
                  Clear the example
                </button>
              </div>
            ) : null}

            <div className="result-head">
              <p className={`state state--${state.key}`}>
                <span className="state-rule" aria-hidden="true" />
                <span className="state-word">{state.word}</span>
                {state.note ? <span className="state-note">{state.note}</span> : null}
              </p>
              {targetText ? <p className="target-label">{targetText}</p> : null}
            </div>

            <div className={figure ? 'verdict' : 'verdict is-text'}>
              {figure ? (
                <div className="figure" aria-hidden="true">
                  <span className="figure-number">
                    {figure.value}
                    <span className="figure-unit">{figure.unit}</span>
                  </span>
                  <span className="figure-label">{figure.label}</span>
                </div>
              ) : null}
              <div className="verdict-copy">
                <p className="verdict-sentence">{answer.sentence}</p>
                {answer.detail ? <p className="verdict-detail">{answer.detail}</p> : null}
                {answer.scale ? <p className="verdict-scale">{answer.scale}</p> : null}
              </div>
            </div>

            {strip ? <CourseStrip plan={plan} strip={strip} caption={caption} /> : null}

            <p className="visually-hidden" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>

            {showSteps ? (
              <details className="how" ref={howRef}>
                <summary>How this was computed</summary>
                <ol className="how-steps">
                  {plan.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        </section>

        <div className="wrap">
          <section className="flow" aria-labelledby="step-heading">
            <div className="step-meter">
              <p className="step-count">
                Step {draft.step} of {TOTAL_STEPS}
              </p>
              <div className="step-progress" aria-hidden="true">
                {[1, 2, 3].map((number) => (
                  <span key={number} className={number <= draft.step ? 'is-done' : ''} />
                ))}
              </div>
            </div>
            <h2 className="step-heading" id="step-heading" tabIndex={-1} ref={headingRef}>
              {STEP_TITLES[draft.step]}
            </h2>

            {draft.step === 1 ? (
              <form
                className="step-body"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (passReady) goToStep(2);
                }}
              >
                <p className="step-note">
                  Copy the passing percentage from your syllabus. The answer is measured against it.
                </p>

                <div className="field-block">
                  <label htmlFor="pass-percent">Passing percentage</label>
                  <div className="input-affix field-short">
                    <input
                      id="pass-percent"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="75"
                      value={draft.passPercent}
                      aria-invalid={passProblem ? 'true' : undefined}
                      aria-describedby={
                        passProblem ? 'pass-help pass-error' : 'pass-help'
                      }
                      onChange={(event) =>
                        editDraft((current) => ({
                          ...current,
                          passPercent: event.target.value,
                        }))
                      }
                    />
                    <span className="affix" aria-hidden="true">
                      %
                    </span>
                  </div>
                  <p className="field-help" id="pass-help">
                    For example, 75. Your school sets this, not Passmark.
                  </p>
                  {passProblem ? (
                    <p className="field-error" id="pass-error">
                      <span>{passProblem.message}</span> <span>{passProblem.fix}</span>
                    </p>
                  ) : null}
                </div>

                <div className="field-block">
                  <div className="label-row">
                    <label htmlFor="min-final">Lowest score allowed on the final</label>
                    <span className="tag">Optional</span>
                  </div>
                  <div className="input-affix field-short">
                    <input
                      id="min-final"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="—"
                      value={draft.minFinalPercent}
                      aria-invalid={minimumProblem ? 'true' : undefined}
                      aria-describedby={
                        minimumProblem ? 'min-help min-error' : 'min-help'
                      }
                      onChange={(event) =>
                        editDraft((current) => ({
                          ...current,
                          minFinalPercent: event.target.value,
                        }))
                      }
                    />
                    <span className="affix" aria-hidden="true">
                      %
                    </span>
                  </div>
                  <p className="field-help" id="min-help">
                    Only fill this in if your syllabus sets a minimum.
                  </p>
                  {minimumProblem ? (
                    <p className="field-error" id="min-error">
                      <span>{minimumProblem.message}</span> <span>{minimumProblem.fix}</span>
                    </p>
                  ) : null}
                </div>

                <div className="actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!passReady}
                    aria-describedby={passReady ? undefined : 'step-one-why'}
                  >
                    Next: your grades
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={tryExample}>
                    Try an example
                  </button>
                </div>
                {passReady ? null : (
                  <p className="action-why" id="step-one-why">
                    {stepOneWhy}
                  </p>
                )}
              </form>
            ) : null}

            {draft.step === 2 ? (
              <form
                className="step-body"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (gradesReady) goToStep(3);
                }}
              >
                <p className="step-note">
                  Use the names from your syllabus. Leave both numbers blank if a part hasn't been
                  taken yet.
                </p>
                <p className="step-note">
                  You don't need to add the final exam. Passmark counts whatever is left as the
                  final.
                </p>

                <ul className="parts">
                  {draft.parts.map((part, index) => {
                    const ownProblems = plan.problems.filter(
                      (problem) => problem.componentId === part.id,
                    );
                    const describedBy = (field) => {
                      const ids = ownProblems
                        .map((problem, problemIndex) =>
                          problem.field === field
                            ? `error-${part.id}-${field}-${problemIndex}`
                            : null,
                        )
                        .filter(Boolean);
                      return ids.length > 0 ? ids.join(' ') : undefined;
                    };
                    const scoreProblem = problemFor(ownProblems, 'score');
                    const totalProblem = problemFor(ownProblems, 'total');
                    const weightProblem = problemFor(ownProblems, 'weight');
                    const fallbackName = `part ${index + 1}`;
                    return (
                      <li className="part" key={part.id}>
                        <div className="part-top">
                          <div className="field">
                            <label htmlFor={`name-${part.id}`}>Part name</label>
                            <input
                              id={`name-${part.id}`}
                              type="text"
                              autoComplete="off"
                              placeholder="Prelim"
                              value={part.name}
                              onChange={(event) =>
                                updatePart(part.id, 'name', event.target.value)
                              }
                            />
                          </div>
                          <button
                            type="button"
                            className="btn-remove"
                            aria-label={`Remove ${
                              part.name.trim() ? part.name.trim() : fallbackName
                            }`}
                            onClick={() => removePart(part.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="part-numbers">
                          <div className="field">
                            <label htmlFor={`score-${part.id}`}>Your score</label>
                            <input
                              id={`score-${part.id}`}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={part.score}
                              aria-invalid={scoreProblem ? 'true' : undefined}
                              aria-describedby={describedBy('score')}
                              onChange={(event) =>
                                updatePart(part.id, 'score', event.target.value)
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`total-${part.id}`}>Out of</label>
                            <input
                              id={`total-${part.id}`}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={part.total}
                              aria-invalid={totalProblem ? 'true' : undefined}
                              aria-describedby={describedBy('total')}
                              onChange={(event) =>
                                updatePart(part.id, 'total', event.target.value)
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`weight-${part.id}`}>How much it counts for</label>
                            <div className="input-affix">
                              <input
                                id={`weight-${part.id}`}
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="30"
                                value={part.weight}
                                aria-invalid={weightProblem ? 'true' : undefined}
                                aria-describedby={describedBy('weight')}
                                onChange={(event) =>
                                  updatePart(part.id, 'weight', event.target.value)
                                }
                              />
                              <span className="affix" aria-hidden="true">
                                %
                              </span>
                            </div>
                          </div>
                        </div>

                        {ownProblems.length > 0 ? (
                          <div className="part-errors">
                            {ownProblems.map((problem, problemIndex) => (
                              <p
                                key={`${problem.code}-${problemIndex}`}
                                id={`error-${part.id}-${problem.field}-${problemIndex}`}
                              >
                                <span>{problem.message}</span> <span>{problem.fix}</span>
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <p className="hint">
                  <strong>Where do I find this?</strong> Check your syllabus or ask your teacher.
                </p>

                <div className="add-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    ref={addButtonRef}
                    disabled={draft.parts.length >= MAX_PARTS}
                    onClick={addPart}
                  >
                    Add another part
                  </button>
                  {draft.parts.length >= MAX_PARTS ? (
                    <p className="add-note">You can add up to {MAX_PARTS} parts.</p>
                  ) : null}
                </div>

                <div className={overBudget ? 'budget is-over' : 'budget'}>
                  <div className="budget-rule" aria-hidden="true">
                    <span
                      style={{
                        transform: `scaleX(${Math.min(Math.max(plan.totalWeight, 0), 100) / 100})`,
                      }}
                    />
                  </div>
                  <p className={overBudget ? 'budget-text is-over' : 'budget-text'}>
                    {budgetText(plan)}
                  </p>
                </div>

                <div className="actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!gradesReady}
                    aria-describedby={gradesReady ? undefined : 'step-two-why'}
                  >
                    Next: what to find out
                  </button>
                  <button type="button" className="btn-link" onClick={() => goToStep(1)}>
                    Back
                  </button>
                </div>
                {gradesReady ? null : (
                  <p className="action-why" id="step-two-why">
                    {stepTwoWhy}
                  </p>
                )}
              </form>
            ) : null}

            {draft.step === 3 ? (
              <form
                className="step-body"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (showSteps) revealSteps();
                  else goToStep(2);
                }}
              >
                {plan.targets.length > 0 ? (
                  <>
                    <fieldset className="choices">
                      <legend className="visually-hidden">Choose what to solve for</legend>
                      {plan.targets.map((target) => (
                        <label className="choice" key={target.id}>
                          <input
                            type="radio"
                            name="solve-for"
                            value={target.id}
                            checked={selectedTarget === target.id}
                            onChange={() =>
                              setDraft((current) => ({ ...current, solveFor: target.id }))
                            }
                          />
                          <span className="choice-text">
                            <span className="choice-name">
                              {target.implicit ? 'The final exam' : target.name || 'This part'}
                            </span>
                            <span className="choice-weight">
                              {formatPercent(target.weight)} of your grade
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    {plan.targets.length > 1 ? (
                      <p className="step-note">
                        The answer is the average you need across them.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="step-note">
                    {plan.status === 'complete'
                      ? 'Every part has a score. There is nothing left to find out.'
                      : 'There is nothing left to solve for yet. Go back and add the grades you already have.'}
                  </p>
                )}

                <div className="actions">
                  {showSteps ? (
                    <button type="submit" className="btn btn-primary">
                      Show the steps
                    </button>
                  ) : (
                    <button type="submit" className="btn btn-primary">
                      Back to your grades
                    </button>
                  )}
                  {showSteps ? (
                    <button type="button" className="btn-link" onClick={() => goToStep(2)}>
                      Back to your grades
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </section>
        </div>
      </main>

      <footer className="footer">
        <div className="wrap">
          <p>Everything stays in this browser. There is no account and no upload.</p>
          <p>Passmark does the arithmetic. Your school decides the rules.</p>
          <button type="button" className="btn-link start-over" onClick={handleStartOver}>
            {confirmReset ? 'Press again to clear everything' : 'Start over'}
          </button>
        </div>
      </footer>
    </>
  );
}
