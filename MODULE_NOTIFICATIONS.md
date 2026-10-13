# Notifications Module

## Purpose

The notifications module owns workflow-level success, failure, and status notification calls. It keeps email delivery non-fatal and returns structured delivery results to callers.

## Public Interface

- `notifySuccess({ task, links })`
- `notifyFailure({ task, error, step })`
- `notifyStatusUpdate({ status, details, aiSuggestions })`

Compatibility exports remain available:

- `sendSuccessNotification(taskData, results)`
- `sendErrorNotification(taskData, error, step)`
- `sendStatusUpdate(status, details, aiSuggestions)`

Notification result shape:

```js
{
  sent,
  recipient,
  subject,
  error
}
```

## Files Changed

- `src/services/emailService.js`
- `src/main_automation.js`
- `MODULE_NOTIFICATIONS.md`

## Legacy Cleanup

- Main workflow now calls workflow-level notification functions instead of direct email-template functions.
- Notification failures remain logged and non-fatal.
- Existing controller paths can still call the older exports.

## Behavior Preserved

- Success emails still use the existing success template.
- Failure emails still use the existing error template and workflow step.
- Status update emails still use the existing status template.
- Email failures do not fail the automation workflow.

## Dependencies

- `EMAIL_USER`
- `EMAIL_APP_PASSWORD`
- `NOTIFICATION_EMAIL`
- `nodemailer`
- `src/config/logger.js`

## Verification

Ran:

```bash
git diff --check
node --check src/services/emailService.js
node --check src/main_automation.js
npm run typecheck
```

All passed.

## Risks

- Live notification smoke tests were not run because they require email credentials and would send real email.
- The existing success email template checks different link key names than the main workflow uses; this pass preserved behavior rather than changing message rendering.

## Notes For Next Refactor

- Cleanup can now focus on local/generated artifacts without owning notification behavior.
- A later notification bugfix can normalize `{ yt, insta, fb }` into the template's expected link names if desired.
