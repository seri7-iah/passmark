import { describe, expect, it } from 'vitest';
import {
  calculatePlan,
  formatPercent,
  parseNumber,
  percentToScale,
  scaleToPercent,
} from './engine.js';

let sequence = 0;

function item(score, total, status = 'graded', name = '') {
  sequence += 1;
  return { id: `item-${sequence}`, name, score, total, status };
}

function part(name, weight, items = [], extra = {}) {
  sequence += 1;
  return { id: `part-${sequence}`, name, weight, items, ...extra };
}

function plan(overrides = {}) {
  return { passPercent: 75, components: [], ...overrides };
}

const close = (actual, expected) => expect(actual).toBeCloseTo(expected, 6);

describe('parseNumber', () => {
  it('reads plain numbers, percent signs and decimal commas', () => {
    expect(parseNumber('85')).toBe(85);
    expect(parseNumber(' 85% ')).toBe(85);
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber(0)).toBe(0);
  });

  it('keeps blank separate from zero', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it('marks junk as not a number', () => {
    expect(Number.isNaN(parseNumber('eighty'))).toBe(true);
  });
});

describe('the required case', () => {
  it('prelim 85 and midterm 80 at 30% each, final 40%, pass 75 needs 63.75%', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 30, [item(85, 100)]),
          part('Midterm', 30, [item(80, 100)]),
          part('Final', 40, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('need');
    close(result.neededPercent, 63.75);
    close(result.earnedPercent, 49.5);
    close(result.targetWeight, 40);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].name).toBe('Final');
    expect(result.sentence).toBe('You need about 64% on the final to pass.');
    expect(result.steps.length).toBeGreaterThanOrEqual(4);
    expect(result.steps.join(' ')).toContain('63.8');
    expect(result.steps.join(' ')).toContain('49.5');
    expect(result.steps.join(' ')).toContain('40%');
    expect(result.neededScale).toBeCloseTo(2.8125, 4);
    expect(result.problems).toHaveLength(0);
  });

  it('solves the same case when the final is not listed at all', () => {
    const result = calculatePlan(
      plan({
        components: [part('Prelim', 30, [item(85, 100)]), part('Midterm', 30, [item(80, 100)])],
      }),
    );

    expect(result.status).toBe('need');
    close(result.neededPercent, 63.75);
    expect(result.targets[0].implicit).toBe(true);
    expect(result.targets[0].weight).toBe(40);
    expect(result.notices.some((notice) => notice.code === 'leftover')).toBe(true);
  });
});

describe('weights', () => {
  it('warns and gives no number when weights add up to 120%', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 30, [item(85, 100)]),
          part('Midterm', 30, [item(80, 100)]),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('weights-over');
    close(result.totalWeight, 120);
    expect(result.neededPercent).toBeNull();
    expect(result.sentence).toBe('Your parts add up to 120%.');
    expect(result.detail).toBe('That is 20% too much.');
    expect(result.steps.join(' ')).toContain('Take 20% off');
  });

  it('treats 33.3 + 33.3 + 33.4 as a full 100', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 33.3, [item(80, 100)]),
          part('Prelim', 33.3, [item(80, 100)]),
          part('Final', 33.4, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.status).toBe('need');
  });

  it('counts unassigned weight with the final, and says so', () => {
    const result = calculatePlan(
      plan({ components: [part('Prelim', 80, [item(80, 100)])] }),
    );

    expect(result.status).toBe('need');
    close(result.targetWeight, 20);
    close(result.neededPercent, 55);
    const notice = result.notices.find((entry) => entry.code === 'leftover');
    expect(notice).toBeTruthy();
    expect(notice.message).toContain('20%');
  });

  it('does not accept a weight that is not a number', () => {
    const result = calculatePlan(
      plan({ components: [part('Prelim', 'lots', [item(80, 100)])] }),
    );
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('weight-number');
  });

  it('does not accept a part with a grade but no weight', () => {
    const result = calculatePlan(
      plan({ components: [part('Prelim', '', [item(80, 100)])] }),
    );
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('weight-missing');
    expect(result.problems[0].message).toBe('How much does Prelim count for?');
    expect(result.problems[0].fix).toContain('The parts normally add up to 100');
  });
});

describe('the three answer states', () => {
  it('shows the best case when the target is impossible', () => {
    const result = calculatePlan(
      plan({
        passPercent: 90,
        components: [
          part('Prelim', 30, [item(50, 100)]),
          part('Midterm', 30, [item(50, 100)]),
          part('Final', 40, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('impossible');
    expect(result.neededPercent).toBeNull();
    close(result.rawNeededPercent, 150);
    close(result.bestPercent, 70);
    expect(result.bestScale).not.toBeNull();
    expect(result.sentence).toBe('The best you can still get is 70%.');
    expect(result.detail).toContain('20 points short');
    expect(result.steps.join(' ')).toContain('No score');
  });

  it('says the target is already reached', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 80, [item(100, 100)]),
          part('Final', 20, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('reached');
    expect(result.passed).toBe(true);
    close(result.floorPercent, 80);
    expect(result.sentence).toContain('already reached');
    expect(result.detail).toContain('0%');
  });

  it('reports a finished course once everything is graded', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 60, [item(90, 100)]),
          part('Final', 40, [item(80, 100)]),
        ],
      }),
    );

    expect(result.status).toBe('complete');
    close(result.earnedPercent, 86);
    expect(result.passed).toBe(true);
    expect(result.sentence).toBe('Your course grade is 86%.');
  });

  it('reports a finished course below the pass mark without blaming anyone', () => {
    const result = calculatePlan(
      plan({
        passPercent: 90,
        components: [
          part('Prelim', 60, [item(90, 100)]),
          part('Final', 40, [item(80, 100)]),
        ],
      }),
    );

    expect(result.status).toBe('complete');
    expect(result.passed).toBe(false);
    expect(result.detail).toBe('That is below your 90% pass mark.');
  });
});

describe('the optional minimum on the final', () => {
  it('raises the answer to the minimum and explains why', () => {
    const result = calculatePlan(
      plan({
        minFinalPercent: 70,
        components: [
          part('Prelim', 30, [item(85, 100)]),
          part('Midterm', 30, [item(80, 100)]),
          part('Final', 40, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('need');
    close(result.rawNeededPercent, 63.75);
    close(result.neededPercent, 70);
    expect(result.minimumApplied).toBe(true);
    expect(result.sentence).toBe('Your course needs at least 70% on the final.');
    expect(result.steps.join(' ')).toContain('aim for 70%');
  });

  it('mentions the minimum even when the pass mark is already reached', () => {
    const result = calculatePlan(
      plan({
        minFinalPercent: 50,
        components: [
          part('Prelim', 80, [item(100, 100)]),
          part('Final', 20, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('reached');
    expect(result.minimumApplied).toBe(true);
    close(result.neededPercent, 50);
    expect(result.sentence).toContain('at least 50%');
  });

  it('rejects a minimum outside 0 to 100', () => {
    const result = calculatePlan(
      plan({
        minFinalPercent: 120,
        components: [part('Prelim', 100, [item(80, 100)])],
      }),
    );
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('minimum-range');
  });
});

describe('pending and blank scores', () => {
  it('never treats a blank score as zero', () => {
    const pending = calculatePlan(
      plan({
        components: [
          part('Prelim', 60, [item(80, 100)]),
          part('Final', 40, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(pending.status).toBe('need');
    close(pending.earnedPercent, 48);

    const blank = calculatePlan(
      plan({ components: [part('Prelim', 60, [item('', 100)])] }),
    );
    expect(blank.status).toBe('invalid');
    expect(blank.problems[0].code).toBe('score-missing');
    expect(blank.problems[0].fix).toBe('A blank score is not the same as zero.');
  });

  it('ignores a part whose only item is not taken yet', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 60, [item(80, 100)]),
          part('Final', 40, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.earnedPercent).toBeCloseTo(48, 6);
    expect(result.gradedWeight).toBe(60);
  });

  it('asks for the missing half of a graded item', () => {
    const noTotal = calculatePlan(plan({ components: [part('Quiz', 20, [item(18, '')])] }));
    expect(noTotal.status).toBe('invalid');
    expect(noTotal.problems[0].code).toBe('total-missing');

    const noScore = calculatePlan(plan({ components: [part('Quiz', 20, [item('', 20)])] }));
    expect(noScore.status).toBe('invalid');
    expect(noScore.problems[0].code).toBe('score-missing');
  });
});

describe('bad entries', () => {
  it('rejects a score above the total', () => {
    const result = calculatePlan(plan({ components: [part('Quiz', 20, [item(25, 20)])] }));
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('score-over');
    expect(result.problems[0].message).toContain('25 out of 20');
  });

  it('rejects a total of zero', () => {
    const result = calculatePlan(plan({ components: [part('Quiz', 20, [item(10, 0)])] }));
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('total-zero');
  });

  it('allows a perfect score', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quiz', 40, [item(20, 20)]),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.status).toBe('need');
    expect(result.problems).toHaveLength(0);
  });

  it('rejects a negative score', () => {
    const result = calculatePlan(plan({ components: [part('Quiz', 20, [item(-1, 10)])] }));
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('score-negative');
  });
});

describe('more than one ungraded part', () => {
  it('returns the average needed across both', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 60, [item(80, 100)]),
          part('Final', 30, [item('', '', 'pending')]),
          part('Project', 10, [item('', '', 'pending')]),
        ],
      }),
    );

    expect(result.status).toBe('need');
    close(result.targetWeight, 40);
    close(result.neededPercent, 67.5);
    expect(result.targets).toHaveLength(2);
    expect(result.descriptor).toBe('the final and project');
    expect(result.steps.join(' ')).toContain('average across');
  });

  it('labels the part the student chose to solve for', () => {
    const final = part('Final', 30, [item('', '', 'pending')]);
    const project = part('Project', 10, [item('', '', 'pending')]);
    const result = calculatePlan(
      plan({
        components: [part('Prelim', 60, [item(80, 100)]), final, project],
        solveFor: project.id,
      }),
    );
    expect(result.primaryTargetId).toBe(project.id);
  });
});

describe('how items combine', () => {
  it('averages item percentages', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 40, [item(8, 10), item(9, 10), item(10, 10)]),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    close(result.earnedPercent, 36);
    close(result.neededPercent, 65);
  });

  it('adds points across items', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 40, [item(18, 20), item(45, 50)], { combine: 'points' }),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    // 63 out of 70 = 90%, worth 36 of the course.
    close(result.earnedPercent, 36);
    close(result.neededPercent, 65);
  });

  it('drops the lowest score before averaging', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 40, [item(80, 100), item(90, 100), item(70, 100), item(100, 100)], {
            combine: 'drop-lowest',
            dropLowest: 1,
          }),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    // 70 is dropped, leaving 80, 90 and 100: 90%.
    close(result.earnedPercent, 36);
    close(result.neededPercent, 65);
  });

  it('refuses to drop every score', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 40, [item(80, 100), item(90, 100)], {
            combine: 'drop-lowest',
            dropLowest: 2,
          }),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('drop-all');
  });
});

describe('scores the student cannot see', () => {
  const base = () =>
    plan({
      components: [
        part('Quizzes', 40, [item('', 100, 'unknown')]),
        part('Final', 60, [item('', '', 'pending')]),
      ],
    });

  it('returns scenarios instead of one guessed number', () => {
    const result = calculatePlan(base());

    expect(result.status).toBe('scenarios');
    expect(result.neededPercent).toBeNull();
    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios.map((entry) => entry.key)).toEqual(['low', 'middle', 'high']);
    expect(result.unknownItems).toHaveLength(1);
  });

  it('moves the answer as the guess moves', () => {
    const result = calculatePlan(base());
    const [low, middle, high] = result.scenarios;

    expect(low.guessPercent).toBe(60);
    expect(middle.guessPercent).toBe(75);
    expect(high.guessPercent).toBe(90);
    close(low.neededPercent, 85);
    close(middle.neededPercent, 75);
    close(high.neededPercent, 65);
    expect(low.neededPercent).toBeGreaterThan(middle.neededPercent);
    expect(middle.neededPercent).toBeGreaterThan(high.neededPercent);
  });

  it('writes a sentence per scenario, with the guess in it', () => {
    const result = calculatePlan(base());
    expect(result.scenarios[1].sentence).toContain('the quizzes at 75%');
    expect(result.scenarios[1].sentence).toContain('75% on the final');
    expect(result.sentence).toBe('There is no single answer yet.');
    expect(result.detail).toContain('no visible score');
  });

  it('uses the graded average as the middle guess', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Prelim', 50, [item(80, 100)]),
          part('Quizzes', 30, [item('', 100, 'unknown')]),
          part('Final', 20, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.status).toBe('scenarios');
    expect(result.guess.middle).toBeCloseTo(80, 6);
    expect(result.scenarios[0].guessPercent).toBe(65);
    expect(result.scenarios[2].guessPercent).toBe(95);
  });

  it('honours a guess the student sets', () => {
    const result = calculatePlan(base(), { guessPercent: 50, guessSpread: 10 });
    expect(result.guess).toEqual({ middle: 50, low: 40, high: 60, spread: 10 });
  });

  it('still works when guesses are mixed with real scores', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 40, [item(80, 100), item('', 100, 'unknown')]),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.status).toBe('scenarios');
    // The visible 80% sets the middle guess. Two quizzes at 80% are worth 32
    // of the course, so (75 - 32) / 0.6 = 71.67% is needed on the final.
    expect(result.guess.middle).toBeCloseTo(80, 6);
    close(result.scenarios[1].neededPercent, 71.666667);
  });

  it('needs a total to guess inside a points-based part', () => {
    const result = calculatePlan(
      plan({
        components: [
          part('Quizzes', 40, [item('', '', 'unknown')], { combine: 'points' }),
          part('Final', 60, [item('', '', 'pending')]),
        ],
      }),
    );
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('unknown-total');
  });
});

describe('empty and invalid plans', () => {
  it('has an empty state with a next step', () => {
    const result = calculatePlan({});
    expect(result.status).toBe('empty');
    expect(result.sentence).toBe('Start with a grade you already have.');
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('asks for the pass mark when parts are entered without one', () => {
    const result = calculatePlan({
      passPercent: '',
      components: [part('Prelim', 60, [item(80, 100)]), part('Final', 40, [item('', '', 'pending')])],
    });
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('pass-missing');
  });

  it('rejects a pass mark outside 0 to 100', () => {
    const result = calculatePlan(plan({ passPercent: 150, components: [part('P', 100, [item(80, 100)])] }));
    expect(result.status).toBe('invalid');
    expect(result.problems[0].code).toBe('pass-range');
  });
});

describe('the example scale', () => {
  it('maps 1.00 to 100% and 3.00 to 60%', () => {
    expect(scaleToPercent(1)).toBe(100);
    expect(scaleToPercent(3)).toBe(60);
    expect(scaleToPercent(5)).toBe(20);
    expect(percentToScale(60)).toBe(3);
  });

  it('clamps outside the table', () => {
    expect(scaleToPercent(0.5)).toBe(100);
    expect(scaleToPercent(6)).toBe(20);
    expect(percentToScale(120)).toBe(1);
    expect(percentToScale(0)).toBe(5);
  });
});

describe('formatting', () => {
  it('rounds for sentences and keeps a decimal for steps', () => {
    expect(formatPercent(63.75, 0)).toBe('64%');
    expect(formatPercent(63.75, 1)).toBe('63.8%');
    expect(formatPercent(70, 1)).toBe('70%');
    expect(formatPercent(0)).toBe('0%');
  });
});
