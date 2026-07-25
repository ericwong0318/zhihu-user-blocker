# Zhihu User Blocker (Manifest V3)

> **Architecture Reference**: See [README.md](./README.md) for project overview, feature descriptions, architecture details, and technical specifications.

---

## AI Development Rules

This file contains strict rules that **must** be followed during AI-assisted development with this codebase.

### Code Quality Constraints

- **File Length Limit**: No single `.ts`/`.tsx` file may exceed **250 lines**. When a file reaches capacity, extract logical modules into sub-files (e.g. `src/factcheck/agents/`).
- **TypeScript**: Strict mode enforced; no implicit `any` types.
- **Testing**: Minimum 80% coverage required for all new code.
- **Error Handling**: Async operations require try/catch; ensure graceful degradation.

### CI & Verification Requirements

1. All changes must pass CI checks (GitHub Actions: lint, test, build).
2. After completing any development task, run full verification:
   - Lint: `npm run lint` (must pass with zero warnings: `--max-warnings 0`)
   - Tests: `npm test` or `npm test -- path/to/test-file`
   - Build: `npm run build`
   - All three commands must pass before considering the task complete.
3. E2E tests with Playwright are **not** run in CI; run manually with `npx playwright test` after `npm run build` if needed.

### AI Task Completion Protocol

After completing any development task, the AI must run the full test suite and build to verify changes:

1. Run tests: `npm test -- path/to/test-file` or `npm test` for all tests
2. Build project: `npm run build`

Both commands must pass before considering the task complete.

### Testing Strategy

#### Pre-Commit (Fast / Local)

- Run formatting and lint fixes: `npm run lint:fix` (Prettier + ESLint)
- Run targeted tests only: `vitest --related` or `npm test -- path/to/test-file` for affected files
- Avoid running the full test suite on every commit; destroys speed and leads to bypassed checks

#### Pre-Push (Medium / Local)

- Run full unit test suite: `npm test`
- Smoke build: `npm run build`

#### CI/CD (Cloud)

- Verified by GitHub Actions on every PR

### Commit Message Conventions

All commit messages **must** follow the [release-please](https://github.com/googleapis/release-please) conventional commits format to enable automated versioning and changelog generation:

- `feat:` - New features (triggers minor version bump)
- `fix:` - Bug fixes (triggers patch version bump)
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, missing semicolons, etc.)
- `refactor:` - Code refactoring without changing functionality
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `build:` - Changes to build system or dependencies
- `ci:` - Changes to CI configuration
- `chore:` - Other maintenance tasks

Example: `feat: add support for blocking multiple users at once`

Breaking changes should be indicated with `BREAKING CHANGE:` in the commit body or `!` after the type: `feat(api)!: change endpoint response format`.

### Code Coverage

- **Runner**: Vitest with `@vitest/coverage-v8` for V8 profiler performance
- **Formatters**: Configure `text`, `html`, and `json-summary` reporters
- **Usage**: Pass uncovered line numbers from coverage reports to agents for targeted test creation (e.g., "Write unit tests covering lines 42–45 in `useBlockUser.ts`")
- **Threshold**: Minimum 80% coverage required for all new code

### Security & Extension Constraints

- **Content Scripts**: No direct DOM manipulation. Use React portals with Shadow DOM for style isolation.
- **Background Scripts**: Service worker handles message routing only. Never access DOM from background.
- **Storage**: Use `chrome.storage.sync` for user config (blocked users, provider configs, etc.). Use `chrome.storage.local` for logs.
- **Message Security**: Validate `sender.origin` in all message handlers.
- **CSP Compliance**: Follow Content Security Policy requirements for Manifest V3.

### Implementation Constraints

- **Architecture**: Keep feature domains separate (blocking vs fact-checking). Do not cross-contaminate feature modules.
- **React Components**: Functional components with hooks only; no class components.
- **State Management**: Use custom hooks for feature state; keep UI layer thin.
- **Async Fact-checking**: Provider calls may take 30+ seconds; always display loading state. Implement proper cancellation on unmount.
- **Provider Fallback**: The fact-check module uses ordered provider fallback (see README). When modifying providers, preserve the fallback order logic.

### UI/UX Guidelines

- **MUI + Emotion**: Use Material UI 5+ with Emotion for styling.
- **Shadow DOM**: All user-facing content injected into pages must use Shadow DOM to prevent page CSS contamination.
- **Loading States**: All async operations require visible loading indicators.
- **Error Feedback**: Display errors to users; do not silently fail.

---



## Reference Links

- [README.md](./README.md) - Architecture, features, build & test overview
- [DEVELOPER.md](./DEVELOPER.md) - Human developer notes & conventions