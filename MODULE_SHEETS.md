# Sheets Module

## Purpose

The Sheets module owns task claiming and workflow status updates for Google Sheets. It hides the row status strings and link update sequence behind task-focused helpers.

## Public Interface

- `claimNextTask()`
- `markTaskProcessing(task)`
- `markTaskPosted(task, links)`
- `markTaskFailed(task, error)`

Compatibility exports remain available:

- `getNextTask(sheetId)`
- `updateSheetStatus(rowId, status, ytLink, instaLink, fbLink, sheetId)`

Task data shape remains:

```js
{
  rowId,
  sno,
  idea,
  scripts,
  description,
  status,
  ytLink,
  instaLink,
  fbLink,
  timestamp
}
```

## Files Changed

- `src/services/sheetsService.js`
- `src/main_automation.js`
- `MODULE_SHEETS.md`

## Legacy Cleanup

- Moved `"Processing"`, `"Posted"`, and failure status construction out of `main_automation.js`.
- Main workflow no longer calls `updateSheetStatus` directly.
- Kept low-level exports for controllers and older scripts.

## Behavior Preserved

- Task claiming still uses the existing first processable row logic.
- Rows are still locked as `"Processing"` immediately after claim.
- Posted rows still receive YouTube, Instagram, and Facebook links in the same columns.
- Failed rows still use `"Error: "` plus the first 50 characters of the error message.

## Dependencies

- `GOOGLE_SHEET_ID`
- `GOOGLE_CREDENTIALS`
- `googleapis`
- Sheet column names described in `README.md`

## Verification

Ran:

```bash
git diff --check
node --check src/services/sheetsService.js
node --check src/main_automation.js
npm run typecheck
```

All passed.

## Risks

- Live Sheets smoke tests were not run because they require Google credentials and would mutate the configured sheet.
- `workflowController.js` still uses the lower-level `getNextTask` and `updateSheetStatus` exports.

## Notes For Next Refactor

- Notifications can now depend on workflow results without also owning Sheets status choices.
- A future pass can migrate `workflowController.js` to the task-focused Sheets helpers.
