# Contributing to Marksheet

Thank you for your interest in contributing to Marksheet!

## Development Workflow

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-change
   ```
2. Install dependencies and start the dev server:
   ```bash
   npm install
   npm run dev
   ```
3. Make your changes, keeping pure scoring and persistence logic inside `src/utils/` so it remains decoupled from UI components and easy to unit-test.
4. Add or update unit tests in `src/utils/scoring.test.ts` for any changes to calculation rules, validation, session transitions, or `localStorage` persistence.

## Verification Checklist Before Opening a PR

Run the full local check suite before submitting:

```bash
npm run check
```

This runs:
- `npm run lint` — TypeScript strict type checking (`tsc --noEmit`)
- `npm test` — All unit tests in `src/utils/scoring.test.ts`
- `npm run build` — Production Vite bundle compilation

## Code Guidelines

- **Keep scoring deterministic:** Never maintain a separate mutable running score outside of question records; use scaled integer helpers (`toScaledInt` / `fromScaledInt`) for decimal math.
- **Accessibility first:** Use native HTML controls (`<button>`, `<input>` with `<label>`, semantic landmarks) and never convey state by color alone.
- **Zero external secrets:** Keep the app 100% client-side with safe, schema-validated `localStorage` reads and writes.

## Pull Requests

- Keep PRs focused on a single feature or bug fix.
- Include screenshots or before/after notes for UI changes.
- Reference any related GitHub issue numbers in the PR description.
