# Passmark

A grade calculator that shows the score a student needs on the final exam to pass.

You enter your school's pass mark and the grades you already have, along with how much each one counts for. Passmark works out what the final exam still needs, and shows the steps so you can check them against your syllabus.

## Example

- Prelim: 85, counts for 30%
- Midterm: 80, counts for 30%
- The final exam counts for the remaining 40%
- Pass mark: 75

Result: you need **63.75%** on the final.
(85 × 0.30 + 80 × 0.30 = 49.5 points. You need 25.5 more, and 25.5 ÷ 40% = 63.75%.)

## Good to know

- The 1.0 to 5.0 scale in the app is only an example. Schools use different tables, so check your own.
- Scores a student cannot see are not supported yet.
- Everything stays in your browser. There is no account and nothing is uploaded.

## Run it

    npm install
    npm run dev

Run the tests with `npm test`.

## Built with

React and Vite. Made with OpenCode and AI design tooling. The calculation module is covered by automated tests.