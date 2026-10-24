# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React, single page, local development only. No deploy target. Greenfield project with no existing code.

## Users

Filipino college students who already have some of their grades back (prelim, midterm, and similar components) and need to know what they have to score on the final exam. They open this on a phone, usually alone and a little anxious, typically right after seeing a grade posted. Their job: turn a pile of partial grades into one number they can act on, and know whether passing at 3.0 is still realistic or a target like 1.75 is still reachable.

## Product Purpose

Passmark answers one question: given my current grades and their weights, what do I need on the final? Success means the student leaves knowing either a concrete score, or a concrete reason no score exists — never a blank, a broken number, or a vague reassurance.

## Positioning

It is an answer tool, not a gradebook. It works natively on the Philippine 1.0–5.0 scale, where 1.0 is the highest and 3.0 is passing, so the answer is already in the units the student is graded in — and it shows the same answer as a percentage. It refuses to produce a number when the inputs cannot support one: weights that do not add up to 100%, a target already reached, a target impossible even with a perfect final. Each case gets its own plain-language message.

## Operating Context

- The student enters each graded component with its grade and its weight in percent (for example 30% prelim, 30% midterm).
- The student picks or enters a target grade on the 1.0–5.0 scale, such as 3.0 to pass or 1.75 to reach.
- Component names and weight splits differ between schools and instructors, so the tool takes whatever the student's syllabus says rather than assuming a fixed split.
- The conversion table between the 1.0–5.0 scale and percentages is an illustrative example only; the student must check their own school's scale.
- Entries are saved in the browser with localStorage, so a refresh or a closed tab does not erase them.
- Used on a phone at 375px width with no sideways scrolling, and with a keyboard on desktop.

## Capabilities and Constraints

Confirmed:

- Inputs: component grades, component weights in percent, target grade. Weighted computation of the final exam score needed to hit the target.
- Output: the required final exam score on the 1.0–5.0 scale and as a percentage.
- A small conversion table between scale and percentage, clearly labelled as an example.
- Explicit messages, not blanks or `NaN`, for: weights that do not total 100%, a target already reached, and a target impossible even with a perfect final.
- localStorage persistence across refresh.
- Keyboard accessible: every input labelled, visible focus states.
- One page. No backend, no accounts, no network calls, no grade storage outside the student's own browser.

Undecided / not to be asserted:

- Any specific school's grading scale, transmutation formula, or passing policy.
- Whether a school rounds, curves, or exempts students from the final.
- Default component names or weight presets beyond what the student types.

## Brand Commitments

- Name: Passmark.
- Voice: a helpful classmate who has already done the math — direct, plain, specific. Not a corporate app, no motivational-poster tone.
- No photos or imagery of people.
- No invented facts: no testimonials, user counts, school names, or claims about grading policies.

## Evidence on Hand

None. There is no real grade data, no school policy documents, and no user quotes in this project. The conversion table is an example scale only and must be labelled as such wherever it appears. Nothing in the interface may imply endorsement by, or accuracy for, a specific school.

## Product Principles

1. One question, one answer: what do I need on the final?
2. Never show a blank or a broken number; every dead end becomes a sentence the student can act on.
3. Never state grading policy as fact; hand the final say to the student's school.
4. It has to work one-handed on a phone before it works anywhere else.
5. Sound like a classmate, not a system.

## Accessibility & Inclusion

Keyboard operable throughout, with labelled inputs and visible focus states. Body text and results must stay readable at phone width and at default zoom; results are reported as text, not conveyed by color alone.
