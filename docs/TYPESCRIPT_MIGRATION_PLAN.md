# Whole-codebase TypeScript migration

## Objective and compatibility rule

Convert first-party executable JavaScript to TypeScript and strengthen the existing composer types while preserving supported behavior, interfaces and entry points. This is a language migration, not another workflow redesign. Keep the currently scheduled strict TypeScript automation unchanged except for justified build integration. Preserve existing working-tree edits to workflowController and emailService in their migrated equivalents.

No migration can promise zero regressions from a compiler pass alone. Each change needs behavioral comparison, an offline smoke check and a rollback point. Existing broken entry points are recorded separately from migration regressions. Invalid credentials, the paused Sheet and live provider integration remain independent operational issues.

## Inspected inventory

| Area | JS files | TS/TSX files | Treatment |
| --- | --- | --- | --- |
| src/config, utils, services, controllers, middleware, routes and legacy main | 41 | 0 | Convert dependencies before callers; preserve legacy interfaces |
| src/automation | 0 | 19 | Keep strict checks and current production behavior |
| bin | 55 | 0 | Convert tool entry points; classify local/read-only/publishing/destructive behavior |
| test | 9 | 0 | Convert harnesses separately from offline tests |
| archive | 6 | 0 | Preserve historical source; classify unsupported entry points explicitly |
| reel-composer | 0 | 19 | Add strict checking and remove loose types without changing editor behavior |
| tests | 0 | 9 | Keep regression suite; add compatibility/syntax smoke coverage |
| Total | 111 | 47 | Inventory must explain every original file |

Counts are tracked files at the inspected baseline. Compiled JavaScript, generated compatibility launchers, third-party libraries, Python inference/vendor engines, HTML and YAML are not JavaScript source to rewrite. Any first-party diagnostic script retained later also joins migration scope. No executable legacy area may disappear from the inventory just to report a successful conversion.

## Evidence that drives the plan

- Root tsconfig checks only src/automation and tests. Passing it currently says nothing about legacy modules or the composer.
- Root package has CommonJS semantics; composer is an independent ESM/Vite package. Do not flip root package type to module during migration.
- Legacy exports include function objects, singleton objects and exported constructors; changing one to a default-export namespace can break require callers.
- Legacy script, audio and publishing return shapes differ from the new automation interfaces. Do not simply redirect them to the new modules.
- Legacy code uses __dirname and process.cwd for assets and generated files. Moving runtime execution into dist can change their resolved locations.
- test/server.js starts listening on import; src/main_automation.js invokes main unconditionally. Import smoke checks must not launch either or call real providers.
- express, cors, multer, puppeteer and @aws-sdk/client-s3 are imported but absent from the root manifest/lockfile. form-data is only transitive. Record intended support and compatible versions before restoring dependencies; do not accidentally upgrade the legacy Express routing behavior to a new major.
- Static import analysis finds unresolved archive paths plus bin/test_service_separation.js and bin/test_simplified_image_service.js references. These are baseline inconsistencies; repair only with documented intended behavior or preserve them as explicit unsupported tools.
- Several bin/test_* files perform uploads; delete_all_social_posts and mass_cleanup are destructive. They are not safe offline regression tests.
- Composer tsconfig lacks strict flags; Vite build alone is not a typecheck. Provider parsing, message payloads and browser media extensions contain any.
- Docker points at a nonexistent root main_automation.js, uses Node 20 and contains historical presenter dependencies. The local-support workflow checks out another branch. Neither should silently be treated as the supported production entry point.

## Execution sequence

1. **Baseline and manifest.** Capture current exports, callers, CLI flags, response shapes, status strings, asset/output paths, provider request structure and cleanup ordering. Save existing user edits. Mark each original file supported, manual integration, destructive or historical. Do not invoke external side effects to discover interfaces.
2. **Build and compatibility foundation.** Keep the current strict production compiler. Add a separate temporary mixed JS/TS migration build and explicit coverage checks, with strict checking for converted TS and noEmitOnError. Preserve Node/CommonJS runtime semantics. Publish no untested module-loader change.
3. **Low-risk dependencies.** Convert styles, text cleanup, logger and configuration first. Type configuration reads without silently making previously optional values mandatory. Preserve initialization timing and exported singleton/constructor shapes.
4. **Core legacy modules.** Convert script, Sheets, email, cleanup, subtitles, voicebox/audio and Drive/video access. Define explicit task/result/error/configuration interfaces. Keep old field names and units in compatibility-facing results. Preserve the user-edited notification aliases and workflow calls.
5. **Media and publishing modules.** Convert image, video processing, composition, Wav2Lip, React/Puppeteer rendering and social posting modules. Verify FFmpeg arguments, upload count, polling, result links and cleanup scopes through fake adapters/local fixtures. Do not merge old and new rendering/publishing implementations just because both are now TS.
6. **Controllers, middleware and routes.** Type Express requests, responses, middleware errors and upload metadata. Preserve route paths, response status codes, JSON omission/null behavior, multipart field names and limits. Use typed request parsing that retains existing coercions for supported input.
7. **Entrypoints and tools.** Convert legacy main, server harness and every bin/test/archive file. Preserve supported command behavior via generated compatibility launchers where needed. Keep live/destructive tools opt-in and outside npm test. Resolve unsupported baseline tools deliberately rather than fabricate missing modules.
8. **Composer strictness.** Type Gemini responses, generated layout data, iframe messages, audio buffers and recording state. Use narrow optional browser-extension declarations for CropTarget/cropTo/webkitAudioContext. Add a real noEmit typecheck alongside the existing Vite build. Keep browser package ESM and do not change its recording flow during this migration.
9. **Cutover and cleanup.** Widen typecheck coverage to every retained executable TS area; remove temporary unchecked JS allowances. Verify clean installation, build, supported old/new commands and caller resolution. Update supported Actions launch paths and docs. Retire Docker/local-support/historical entry points only after an explicit support decision.
10. **Review, commit, push and merge.** Run syntax/type checks, targeted compatibility tests and the existing offline smoke suite. Review standards and spec separately. Commit on codex feature branches, push to the authorized repository, then merge the tested changes to main without including unrelated work or changing Sheet pause state.

The order is dependency-driven; a large module may use several small commits before the caller cutover. Do not couple a model/provider upgrade or visual redesign to this migration.

## Compiler and runtime strategy

- Keep root NodeNext configuration and existing CommonJS output semantics. Keep browser ESNext/Bundler configuration separately.
- Allow mixed JavaScript inputs only in a migration configuration, not as a weakening of production strictness. Eliminate it at completion. [TypeScript migration guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html).
- Use strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and useUnknownInCatchVariables for executable TS. Do not obtain a pass with ts-nocheck, broad any aliases or ambient declarations for missing real modules.
- Prefer typed imports for known dependencies; require returning any is not evidence of a typed interface. Preserve CommonJS export shape explicitly where existing callers depend on it. Runtime interpretation depends on package/module configuration. [TypeScript module reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html).
- Never assume plain Node resolves extensionless imports to .ts. Test the exact launcher/compiled artifact. Keep source inputs and compiler outputs separate, and avoid competing .js/.ts inputs that emit the same filename.
- For supported old JS command paths, retain a small generated compatibility launcher through the transition. It loads the checked TypeScript source through the runtime `tsx` dependency with the same arguments and working-directory assumptions. This deliberately preserves source-relative `__dirname` asset paths; emitted `dist-legacy` files are build/syntax evidence, not a relocated runtime deployment. Generated launchers are not a second authored implementation.
- Do not relocate file-dependent runtime code until the project-root/output-directory contract is tested. A new path helper must preserve the existing caller-specific behavior; process.cwd cannot be replaced globally without evidence.
- Composer needs tsc --noEmit as well as Vite build, since Vite transpiles TypeScript without doing type checking. [Vite TypeScript support](https://vite.dev/guide/features.html#typescript).

## Type policy

Use explicit task identifiers, provider/result structures, configuration objects, caption/segment timing, rendering options and platform outcomes. Preserve public legacy fields during migration. Narrow unknown errors and external JSON at module seams; preserve supported numeric/string coercions and optional/null semantics. Specify duration units in interface names. Validate provider and browser messages instead of asserting them into domain types. Isolate any unavoidable SDK/browser adaptation with a named guard and test; do not spread casts across callers.

## Verification gates

| Change | Required evidence |
| --- | --- |
| Leaf/config conversion | Export-shape and pure-result parity; no new import-time I/O |
| Provider module | Mocked request/result parity and failure propagation; no real API write |
| Media module | Short local fixture, argument/path/timing checks and bounded process failure |
| Publishing/cleanup | No duplicate submission, correct partial result, consumer-safe cleanup, scoped filesystem actions |
| Controller/route | Existing method/path/status/body contract and invalid-input behavior using fake module dependencies |
| CLI/server | Exact startup/flags/exit behavior; import does not unexpectedly bind a port or start a job |
| Composer | Strict typecheck plus build; local browser smoke for upload/edit/replace/play/record states without provider calls |
| Final merge | Clean-install reproducibility, all retained source covered, offline regression suite, explicit known limitations |

The 26 previously passing offline checks protect the active automation, not every legacy interface. Add characterization tests for legacy callers before declaring parity. Never run a bin/test_* file merely because its filename looks like a test. Real publishing remains the separately authorized production/integration activity.

## Rollback and completion

Keep each migration batch independently revertible. Reverting code must not reset Sheet state, delete social posts, retry uploads or clear PAUSED. Reconcile known provider outcomes before rerunning a job after rollback.

Completion requires: every inventory entry converted or explicitly dispositioned; all retained first-party executable logic in checked TS/TSX; composer strictness verified; generated JavaScript distinguished from source; compatibility commands and assets preserved; source/build coverage enforced in CI; no blanket type suppression; no unexplained missing imports; and the tested commits present on main. Counts, test evidence and deferred manual integration are recorded at the end.

The migration can preserve known working behavior and test it. It cannot certify already-broken legacy tools or live services whose credentials/project access are unresolved; those limits must remain visible rather than hidden behind a green typecheck.
