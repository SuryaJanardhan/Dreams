# Dreams engineering documentation

Written from the working tree on 11 October 2026, including existing uncommitted script-module changes. These documents describe inspected source; they do not certify a successful production run.

- [Project map](PROJECT_MAP.md): current execution paths, dependencies, artifacts, and known inconsistencies.
- [Refactor proposal](REFACTOR_PROPOSAL.md): proposed module ownership, architecture alternatives, strict TypeScript migration, and delivery gates.
- [Module interviews](MODULE_INTERVIEWS.md): 12 decision questions for each of 10 proposed modules.
- [Decision record](DECISIONS.md): agreed constraints and open architectural decisions.

Start with IMPLEMENTATION.md for the active path and operational limits, then use the project map for historical context. The accepted choices are recorded in DECISIONS.md.

Existing documents such as `../MODULE_REFACTOR_PLAN.md`, `../MODULE_SCRIPT.md`, `../prompt.md`, and `../explanation.md` remain useful historical context. The new proposal intentionally considers behavior changes as requested, whereas the older plan emphasizes preserving behavior.

- [Domain glossary](../CONTEXT.md): agreed meanings of task, job, completion, partial publication, and pause.

- [Round three: 30 MCQs](WORKFLOW_ROUND_3.md): accepted workflow, custom animation, and operations choices.
- [Rendering decision](adr/0001-custom-animation-frame-rendering.md): accepted custom-code direction and tradeoffs.

- [Active implementation and recovery](IMPLEMENTATION.md)
