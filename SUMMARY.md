# Task Summary: Remove Fact Check Progress Bar & Timeout

## Primary Request and Intent

1. **Original task**: "remove fact check progress bar and use streaming flow of AI thinking instead"
2. **User feedback**: "the ai think a about 10 second and return blank result. you should remove the timeout of fact check."

## Key Technical Concepts
- Manifest V3 Chrome extension
- React 18 with MUI 5 + Emotion
- Vitest for unit testing
- TypeScript strict mode
- Shadow DOM for style isolation
- Chrome extension messaging (long-lived port for streaming)
- AbortController for request cancellation
- Provider fallback chain (OpenAI, Claude, Gemini, etc.)

## Files Modified

### Phase 1: Progress Bar → Streaming Stages (COMPLETE)

1. **`src/features/fact-check/hooks/useFactCheckRunner.ts`**
   - Added `onStage` callback parameter to `runFactCheck` and `useFactCheckRunner`
   - Previously stage messages from background port were silently ignored; now streamed to UI
   - Removed `timeoutSec` parameter (part of timeout removal)
   - Exports `StageReporter` type

2. **`src/features/fact-check/hooks/useFactCheckAction.ts`**
   - Replaced `progress` (number) and `stage` (string) state with `stages: string[]` array
   - Removed `setInterval` timer that drove the progress bar
   - `handleClick` now passes `onStage` callback to `onFactCheck` that appends stages
   - Exports `StageReporter` type

3. **`src/features/fact-check/components/FactCheck.tsx`**
   - Removed `LinearProgress`, `progress` state, `stage` state, `timeoutMs` state, timer logic
   - Replaced with `stages: string[]` array displaying vertical list of thinking steps
   - Dot indicators with current step highlighted (primary color)
   - Removed `factCheckTimeoutSec` from storage listener
   - Removed `MAX_FACTCHECK_MS` import

4. **`src/features/fact-check/components/FactCheckButton.tsx`**
   - Removed `LinearProgress` import
   - Replaced `progress`/`stage` with `stages` from `useFactCheckAction`
   - Same streaming stages UI with dot indicators

### Phase 2: Remove Timeout (IN PROGRESS)

5. **`src/features/fact-check/providers.ts`** (JUST COMPLETED)
   - Removed `DEFAULT_PROVIDER_TIMEOUT_MS` constant
   - Removed `timeoutMs` parameter from `callProvider` and `callProviders`
   - Removed `setTimeout(() => controller.abort(), timeoutMs)` — no more timeout abort
   - Removed `timeout` field from OpenRouter request body
   - Removed timeout-specific error message ("Provider timed out after Xs")
   - Kept `AbortController` for external cancellation (port disconnect)
   - `callProvider` signature: `(text, question, config, signal?)` — no timeoutMs
   - `callProviders` signature: `(text, question, configs, onStage?, signal?)` — no timeoutMs

### Tests Updated (Phase 1 - COMPLETE)
6. **`src/features/fact-check/components/FactCheck.test.tsx`** — streaming stages assertions
7. **`src/features/fact-check/components/FactCheckButton.test.tsx`** — mock uses `stages: []`
8. **`src/features/fact-check/hooks/useFactCheckAction.test.ts`** — stages assertions, new streaming test
9. **`src/features/fact-check/hooks/useFactCheckRunner.test.ts`** — onStage streaming tests

## Pending Tasks (Phase 2 - Timeout Removal)

- **`src/background.ts`**: Remove `factCheckTimeoutSec` from storage reads, remove `timeoutMs` from `callProviders` calls
- **`src/features/fact-check/hooks/useFactCheckConfig.ts`**: Remove `timeoutSec` state, `factCheckTimeoutSec` from storage reads
- **`src/features/fact-check/pipeline.ts`**: Remove `MAX_FACTCHECK_MS` constant
- **`src/features/fact-check/index.ts`**: Remove `MAX_FACTCHECK_MS` export
- **`src/components/ContentControls.tsx`**: Remove `timeoutSec` from `useFactCheckConfig` and `useFactCheckRunner`
- **`src/options/Options.tsx`**: Remove timeout UI (TextField, state, storage read/write)
- Update tests: `providers.test.ts`, `background.test.ts`, `useFactCheckConfig.test.ts`, `useFactCheckRunner.test.ts`, `Options.test.tsx`, `ContentControls.test.tsx`

## Verification Status
- Lint: PASS (0 warnings) — but will need re-run after timeout removal
- Tests: 227 passed — but will need re-run after timeout removal
- Build: PASS — but will need re-run after timeout removal
