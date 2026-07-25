Task: Remove fact check progress bar and use streaming flow of AI thinking instead

## Summary of Changes

### Core Implementation

1. **`useFactCheckRunner.ts`** — Added `onStage` callback parameter to `runFactCheck` and `useFactCheckRunner`. Previously, stage messages from the background port (`{ stage, isRetry }`) were silently ignored. Now they are streamed to the UI via the `onStage` callback, enabling real-time "AI thinking" display.

2. **`useFactCheckAction.ts`** — Replaced `progress` (number) and `stage` (string) state with a `stages: string[]` array. Removed the `setInterval` timer that drove the progress bar. The `handleClick` function now passes an `onStage` callback to `onFactCheck` that appends each stage to the array, creating a streaming log of AI thinking steps.

3. **`FactCheck.tsx`** — Removed `LinearProgress`, `progress` state, `stage` state, `timeoutMs` state, and the timer logic. Replaced with a `stages: string[]` array that displays a vertical list of thinking steps with dot indicators. The current (last) stage is highlighted. Also removed `factCheckTimeoutSec` from the storage listener (no longer needed without the timer).

4. **`FactCheckButton.tsx`** — Removed `LinearProgress` import. Replaced `progress` and `stage` from `useFactCheckAction` with `stages`. Replaced the progress bar UI with the same streaming stages list (dot indicators, current stage highlighted).

### Tests Updated

5. **`FactCheck.test.tsx`** — Updated to verify streaming stages appear (Parsing text, Running logic analysis, Analyzing bias, Synthesizing verdict, Contacting provider) instead of checking for a `progressbar` role element. Added retry stage test. Fixed provider config to use lowercase `'openai'` (matching `KNOWN_PROVIDERS`).

6. **`FactCheckButton.test.tsx`** — Updated mock to return `stages: []` instead of `progress: 0` and `stage: ''`.

7. **`useFactCheckAction.test.ts`** — Replaced all `progress` assertions with `stages` assertions. Added a new test verifying stages are streamed from the `onStage` callback. Removed fake timer usage (no longer needed without the timer).

8. **`useFactCheckRunner.test.ts`** — Updated the "stage messages" test to verify `onStage` is called (previously tested that stage messages were ignored). Added a new test for `isRetry` flag streaming.

### Verification
- Lint: `npx eslint . --max-warnings 0` → 0 warnings
- Tests: `npx vitest run` → 227 passed (24 files)
- Build: `npm run build` → success
