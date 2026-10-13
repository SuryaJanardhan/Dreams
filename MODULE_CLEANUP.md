# Cleanup Module

## Purpose

The cleanup module owns generated workspace preparation and local artifact cleanup policies. This pass adds workflow-level cleanup names while preserving the existing cleanup behavior and timing.

## Public Interface

- `prepareWorkflowWorkspace()`
- `cleanupAfterSuccess()`
- `cleanupAfterFailure()`

Compatibility exports remain available:

- `cleanDirectory(dirPath)`
- `cleanupAllMediaFolders()`
- `cleanupOldFiles(dirPath, maxAgeInDays)`
- `getFolderSizes()`
- `ensureDirectoryExists(dirPath)`
- `initializeDirectories()`
- `cleanupRootDirectory()`
- `cleanupOnError()`
- `ensureEssentialVideoFiles()`
- `cleanupFinalVideoFolder()`

## Files Changed

- `src/services/cleanupService.js`
- `MODULE_CLEANUP.md`

## Legacy Cleanup

- Added task-focused cleanup entry points that match the module plan.
- Kept existing low-level exports for controllers and scripts.
- Did not wire new destructive cleanup calls into `main_automation.js`; doing so would change artifact retention behavior.

## Behavior Preserved

- Existing controller cleanup paths still call the same functions.
- Successful cleanup behavior is still `cleanupAllMediaFolders`.
- Failure cleanup behavior is still `cleanupOnError`.
- Workspace preparation still delegates to `initializeDirectories`.

## Dependencies

- Filesystem access to generated folders and root artifacts.
- `src/config/logger.js`.

## Verification

Ran:

```bash
git diff --check
node --check src/services/cleanupService.js
npm run typecheck
```

All passed.

## Risks

- Cleanup scripts were not run because they delete generated files and root media artifacts.
- `main_automation.js` still intentionally leaves local cleanup timing unchanged.
- Existing cleanup policies may still be too broad for some generated root files; this pass only introduced safer module entry points.

## Notes For Next Refactor

- The module refactor plan is now implemented through the planned module list.
- A later cleanup policy pass should decide exactly which root artifacts are retained for debugging versus removed after publication.
