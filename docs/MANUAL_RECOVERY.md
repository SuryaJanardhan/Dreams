# Exact manual corrections before restarting Dreams

Evidence: [read-only configuration check](https://github.com/SuryaJanardhan/Dreams/actions/runs/38396216770). Checks ran inside Actions against configured secrets. They did not send email, generate content, change Sheet data or publish posts. Production remains PAUSED.

All required environment entries are present. The earlier missing-YOUTUBE_REFRESH_TOKEN report was incorrect because the repository secret listing was paginated. The token exists, but its refresh request fails.

## Confirmed findings

| Area | Observed result | Correction |
| --- | --- | --- |
| Gmail | SMTP authentication rejected with 535, both with the original password and after removing whitespace | Generate a new Google app password for the account identified by EMAIL_USER; replace EMAIL_APP_PASSWORD |
| YouTube | OAuth refresh request returns invalid_grant | Reauthorize the channel with the matching OAuth client and replace YOUTUBE_REFRESH_TOKEN |
| Supabase | URL parses correctly, uses HTTPS and the expected host suffix, has no outer quotes/whitespace or extra path, but hostname lookup returns ENOTFOUND | Confirm the project is active and copy its actual Project URL from the dashboard; resume it if paused |
| Sheet row 6 | Processing; no Task ID, Job ID, readable Progress JSON or saved links for any platform | Resolve the legacy row as described below; do not automatically assume it never published |
| AutomationControl | PAUSED = TRUE | Clear only after fixing credentials/project access and resolving row 6 |

Google Sheets, both Gemini model metadata endpoints, AssemblyAI, Instagram account lookup and Facebook page lookup returned successful read/authentication results. Facebook also returned a page token. These checks do not establish publishing permissions, generation quotas or a complete end-to-end success.

## 1. Repair Gmail authentication

Open [Dreams → Settings → Secrets and variables → Actions](https://github.com/SuryaJanardhan/Dreams/settings/secrets/actions).

1. Sign in to the Google account that should send pipeline notifications.
2. Ensure EMAIL_USER is that account's complete email address.
3. With 2-Step Verification enabled, create a fresh password at [Google App Passwords](https://myaccount.google.com/apppasswords).
4. Replace EMAIL_APP_PASSWORD with that generated app password. Prefer copying it without displayed grouping spaces; the diagnostic already established that removing spaces from the old password does not repair it.
5. Keep NOTIFICATION_EMAIL as the intended recipient. The observed error is sender authentication, not a missing recipient.

Google app passwords require 2-Step Verification and are revoked after a Google account password change. The diagnostic does not distinguish revocation from a wrong-account/password pairing. [Google instructions](https://support.google.com/mail/answer/185833).

## 2. Renew YouTube's refresh token

The current token is present but Google rejects its refresh grant. Do not substitute OAUTH_ACCESS_TOKEN: an access token is not a durable replacement for a refresh token.

1. Use the OAuth client corresponding to GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Retrieve these client settings in Google Cloud Console; do not accidentally authorize with a different client.
2. Authorize the Google account/channel that should receive the videos, requesting offline access and the YouTube upload/read permissions used by this pipeline: `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`.
3. Complete Google consent and exchange the authorization code for tokens.
4. Save the returned **refresh token** in YOUTUBE_REFRESH_TOKEN. If you deliberately use a new OAuth client, also update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to that same client.

[OAuth Playground](https://developers.google.com/oauthplayground/) can perform this flow using your own OAuth credentials. A web client used with Playground needs its matching authorized redirect URI configured. Google login/consent requires the account owner. [Google's offline-access guide](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps).

For long-term automation, review the OAuth app's publishing status: Google documents a seven-day refresh-token lifetime for external apps in Testing with scopes beyond basic identity. This is a possible recurring failure cause, not a confirmed diagnosis of this account. [Refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## 3. Restore Supabase connectivity

1. Open the intended project in the [Supabase dashboard](https://supabase.com/dashboard).
2. If it is paused, resume it. If it was deleted, select or create the replacement project you intend to use.
3. Copy its actual Project URL and update SUPABASE_URL if the existing secret points to the wrong project.
4. If the project changed, also update SUPABASE_SERVICE_ROLE_KEY to the key belonging to that project.
5. Once connectivity works, verify SUPABASE_BUCKET names the staging bucket (default `videos`) and that the pipeline's public staging URLs are usable. Bucket existence/public visibility and the storage key could not be validated while DNS failed; the diagnostic's `bucketPublic: false` is not proof the bucket is private.

The runner's ENOTFOUND means hostname resolution failed. A wrong project reference, paused/deleted project or network DNS issue are possibilities; this check cannot select one conclusively. [Supabase DNS troubleshooting](https://supabase.com/docs/guides/troubleshooting/nxdomain-error-connecting-to-a-supabase-project).

## 4. Resolve Sheet row 6 before unpausing

The row is a legacy Processing entry without a recoverable execution record. No links are saved, but that alone does not prove no remote post exists.

1. Inspect the topic and the relevant platform histories for any post already created by the old run.
2. To abandon that interrupted task and let later Not Posted rows proceed, set its Status to `Interrupted` and add a remark explaining the old run's uncertain outcome. Preserve any links you discover.
3. If you want to retry the topic, set it to Not Posted only after confirming that no duplicate publication will result. A partial or uncertain publication needs deliberate reconciliation; there is no automatic repost.
4. In AutomationControl, change the PAUSED value to `FALSE` only after the credential/project fixes and row review are complete. Clear/update REASON to record that recovery was deliberate.

The code can recognize a legacy interruption, record unknown outcomes and pause. It cannot reconstruct a lost job history or prove remote absence from blank Sheet cells. Clearing PAUSED while row 6 is still Processing will trigger interruption handling and pause again.

## 5. Recheck before a production run

Rerun the read-only check on the diagnostic feature branch. It should authenticate Gmail, accept the YouTube refresh grant, reach the Supabase bucket and read the corrected control/row state. Then run Dreams Automated Reels against main.

The `codex/configuration-check` branch is a diagnostic-only branch: it replaces that branch's production workflow with a read-only check for dispatch. **Do not merge it into main.** The production workflow on main remains intact.

Only Google account consent/password issuance, Supabase project/account recovery and the decision about the uncertain old post require your manual intervention. Credential values were not printed or copied out of Actions by these checks.
