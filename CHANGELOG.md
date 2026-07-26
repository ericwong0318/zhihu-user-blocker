# Changelog

## [1.6.0](https://github.com/ericwong0318/chrome-extensions/compare/v1.5.0...v1.6.0) (2026-07-26)


### Features

* add AI provider logging for fact-check feature ([cded4d9](https://github.com/ericwong0318/chrome-extensions/commit/cded4d9ceb122e56c9b5861e0f9c3b9429774fe7))
* add Enable Fact Check toggle in options page ([4346c1d](https://github.com/ericwong0318/chrome-extensions/commit/4346c1d915ac5b20fdc74ee681e39f4f58adbaaf))
* add NewsAPI.ai (Event Registry) provider for real-time news fact-checking ([01b43e6](https://github.com/ericwong0318/chrome-extensions/commit/01b43e6c98a50b8f7e59596ef9a72592cfd042ae))
* add provider timeout with 3-minute default and increase max tokens ([4d09b16](https://github.com/ericwong0318/chrome-extensions/commit/4d09b16ba8f52d558c7728c069f90f9295cb04ef))
* **config:** add coverage thresholds and expand eslint ignores ([645029e](https://github.com/ericwong0318/chrome-extensions/commit/645029e8bf326df241529a7f1998833e0b07ba71))
* enhance AI provider logging with detailed prompt/response tracking ([ef30bd7](https://github.com/ericwong0318/chrome-extensions/commit/ef30bd79d13672e72c2f0de17eba64457c904c31))
* enhance fact-check pipeline agents with functional implementations\n\n- Fix Bias.ts regex patterns (add gi flags for matchAll compatibility)\n- Fix Bias.ts import (ExtractedClaim from Parser)\n- Fix Logic.ts TypeScript inference issue\n- Fix Parser.ts language detection (zh parameter mapping)\n- Fix Parser.ts traditional Chinese detection\n- Fix Parser.ts URL extraction and title extraction from markdown links\n- Implement splitIntoSentences for claim extraction\n- Improve claim classification with patterns and confidence scoring\n- Fix table deduplication in extractMarkdownElements and extractResources\n- Add comprehensive tests for all agents ([0433137](https://github.com/ericwong0318/chrome-extensions/commit/043313734d21a2e5a21885debb83837df6b6979b))
* enhance fact-check pipeline with improved logic and bias analysis ([913652f](https://github.com/ericwong0318/chrome-extensions/commit/913652fbc51290be98de80ff6f523e65100265d1))
* enhance LogViewer to display detailed AI provider logs ([9d0a0f7](https://github.com/ericwong0318/chrome-extensions/commit/9d0a0f7b224f8cbc60221b10c32aa215fd840346))
* include Zhihu question in fact-check prompt ([325d71c](https://github.com/ericwong0318/chrome-extensions/commit/325d71c88bbd4f7fdb0ebaec6c43739bfa1bdb92))
* remove NewsAPI option from UI and provider configuration ([246bcc5](https://github.com/ericwong0318/chrome-extensions/commit/246bcc59fef50c32344e3a25b24a2fdcc8db1713))
* replace fact-check progress bar with streaming AI thinking flow ([b0586f3](https://github.com/ericwong0318/chrome-extensions/commit/b0586f3bc2a032f5cdfd632de425209f2c94b7af))


### Bug Fixes

* add 'zh' language shorthand support in Parser agent ([91a6417](https://github.com/ericwong0318/chrome-extensions/commit/91a6417ff24d676c7b361243e90ef619aac91a06))
* BlockUserList component for Options page ([7854dda](https://github.com/ericwong0318/chrome-extensions/commit/7854dda26cf15ca3d3710173b594d47be28c7e80))
* hide blocked user's answer content when loaded from storage ([232feb4](https://github.com/ericwong0318/chrome-extensions/commit/232feb4604d6efbc46be2ee09c0032a636d40872))
* parse error in release-please-config.json ([a7c9161](https://github.com/ericwong0318/chrome-extensions/commit/a7c9161c5cb3bcf87a7cb99ad69c29d3a49aa16e))
* pass AbortSignal instead of number to callProvider in Options.tsx ([b9e09e7](https://github.com/ericwong0318/chrome-extensions/commit/b9e09e7c0de6549a2f28901d85587551b28f1ce6))
* remove unused timeoutMs parameter from background message handler ([d440072](https://github.com/ericwong0318/chrome-extensions/commit/d440072f644b21f38cfaac246b6a2f20e0ed7901))
* resolve TypeScript build errors in Parser.ts ([fd82cb1](https://github.com/ericwong0318/chrome-extensions/commit/fd82cb1ee5931bb9e1c559b70da3d95bac98a38f))
* return full response object from background in useFactCheckRunner ([3f7f518](https://github.com/ericwong0318/chrome-extensions/commit/3f7f518a7a512ee54f7fb167188a84f9d786208d))
* unwrap nested provider result before passing to UI ([9597e4b](https://github.com/ericwong0318/chrome-extensions/commit/9597e4b739def1141e5b16823c2c0eb2fa7ac75b))
* update LogViewer message for clarity ([d81e658](https://github.com/ericwong0318/chrome-extensions/commit/d81e6589fe9ce26f2ee9520b2dbf74b806f6a472))
* use global setTimeout/clearTimeout in fact-check providers for Service Worker compatibility ([2059d18](https://github.com/ericwong0318/chrome-extensions/commit/2059d18d1c3ef9d7b1ff83722ff6a39f4f8e5270))

## [1.5.0](https://github.com/ericwong0318/chrome-extensions/compare/v1.4.1...v1.5.0) (2026-07-24)


### Features

* add unit tests for ContentControls component ([cb164f4](https://github.com/ericwong0318/chrome-extensions/commit/cb164f425b439b8d1b8042778801b6b7382b5e44))


### Bug Fixes

* resolve TypeScript type assertion error in useBlockUser.ts storage listener ([9d53170](https://github.com/ericwong0318/chrome-extensions/commit/9d53170f811cfcf56d5062a55f66329a358b5108))

## [1.4.1](https://github.com/ericwong0318/chrome-extensions/compare/v1.4.0...v1.4.1) (2026-07-22)


### Bug Fixes

* correct space formatting of agent descriptions in Bias, Logic, and Parser files ([e778920](https://github.com/ericwong0318/chrome-extensions/commit/e77892007c55d3fa330408bc65db35f9b99955ae))
* update Stack and TextField components for better styling and input handling ([a7e9890](https://github.com/ericwong0318/chrome-extensions/commit/a7e9890a40719c07e36186568fb681ea25c79ab4))

## [1.4.0](https://github.com/ericwong0318/chrome-extensions/compare/v1.3.1...v1.4.0) (2026-07-22)


### Features

* add multi‑provider AI fallback with ordered provider list and UI updates ([7ddf27a](https://github.com/ericwong0318/chrome-extensions/commit/7ddf27aadcde93df5d611ce17516c18a74f53a24))
* centralize fact-check provider config normalization ([2b70d52](https://github.com/ericwong0318/chrome-extensions/commit/2b70d5268e42d380de95a9056a4e4fbb980b1cb2))
* Fact Check reply-language setting and inline button placement ([db7751b](https://github.com/ericwong0318/chrome-extensions/commit/db7751bb418d7580aeae8d15f02222f631bd0130))
* implement multi-agent fact-checking pipeline with placeholder agents ([aa8f74a](https://github.com/ericwong0318/chrome-extensions/commit/aa8f74a802cad31163817626a58c3aab3c485753))
* store error logs locally and show them in options page ([486f675](https://github.com/ericwong0318/chrome-extensions/commit/486f67554cff23b54966d8642dc1dcc211c7a037))


### Bug Fixes

* add block buttons to lazy-loaded answers via MutationObserver ([4d283e1](https://github.com/ericwong0318/chrome-extensions/commit/4d283e1c4cde985678e5f0652ac4ecdba9f1ae1a))
* add missing [@emotion](https://github.com/emotion) peer dependencies for MUI ([a8cbf18](https://github.com/ericwong0318/chrome-extensions/commit/a8cbf18c1807b3c3ff39360955c94b4c4b762b13))
* cancel in-flight fact-check provider calls when content port disconnects ([900009a](https://github.com/ericwong0318/chrome-extensions/commit/900009a04a5f331db61214eeeb683bda21988460))
* **deps:** align react-dom and types with React 19 in PR [#8](https://github.com/ericwong0318/chrome-extensions/issues/8)\n\n- bump react-dom to ^19.2.8\n- bump @types/react-dom to ^19.2.3\n\nReproduced CI locally: npm install, npm test, npm run build (all success). ([5d26ab3](https://github.com/ericwong0318/chrome-extensions/commit/5d26ab30294f32d8bbcc9b84192cfd9d13b76007))
* enhance provider configuration validation for local and other providers ([68faff3](https://github.com/ericwong0318/chrome-extensions/commit/68faff35f2660b5a50ea921b41ab845506fb62d4))
* fix UI language update in FactCheck component ([26527d7](https://github.com/ericwong0318/chrome-extensions/commit/26527d7fe6283c73c9306de7d0faf37c8d6a60e1))
* ignore benign ResizeObserver loop notifications in error log ([06aac0f](https://github.com/ericwong0318/chrome-extensions/commit/06aac0fa48604a047ea8ea2a7d62231f1e46593a))
* local provider configuration with CORS instructions and add AI task completion protocol ([a9e3175](https://github.com/ericwong0318/chrome-extensions/commit/a9e317532836b7a4a6e399d45b24939e7d675bac))
* remove unnecessary permissions from manifest.json ([7c4ed88](https://github.com/ericwong0318/chrome-extensions/commit/7c4ed88c86cfe2026a6fef9573317d7444216b92))
* update authorization header assignment to use dot notation ([0b71618](https://github.com/ericwong0318/chrome-extensions/commit/0b716180d58245fff3caae7f7d7f480554710a43))
* update FactCheck to include provider information in result type ([906473a](https://github.com/ericwong0318/chrome-extensions/commit/906473a6c89fbeba6f28e7cd0a8d874e79715d25))

## [1.3.1](https://github.com/ericwong0318/chrome-extensions/compare/v1.3.0...v1.3.1) (2026-07-21)


### Bug Fixes

* local provider configuration with CORS instructions and add AI task completion protocol ([15318fe](https://github.com/ericwong0318/chrome-extensions/commit/15318fe9155fdaee59a2bf5239f83ed280ee5176))

## [1.3.0](https://github.com/ericwong0318/chrome-extensions/compare/v1.2.1...v1.3.0) (2026-07-20)


### Features

* add multi‑provider AI fallback with ordered provider list and UI updates ([92f6290](https://github.com/ericwong0318/chrome-extensions/commit/92f62908a99a63c216b28316ce30b6a491c00b0e))
* implement multi-agent fact-checking pipeline with placeholder agents ([a04756f](https://github.com/ericwong0318/chrome-extensions/commit/a04756f58a7f1acbd9caab60c18989dbaaa07ffc))


### Bug Fixes

* fix UI language update in FactCheck component ([b5187c8](https://github.com/ericwong0318/chrome-extensions/commit/b5187c8d32bb6dada62ee3c50285c528be408758))

## [1.2.1](https://github.com/ericwong0318/chrome-extensions/compare/v1.2.0...v1.2.1) (2026-07-19)


### Bug Fixes

* add missing [@emotion](https://github.com/emotion) peer dependencies for MUI ([a8cbf18](https://github.com/ericwong0318/chrome-extensions/commit/a8cbf18c1807b3c3ff39360955c94b4c4b762b13))
