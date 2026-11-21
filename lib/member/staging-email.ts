/** Owner's staging-only exception; flags on other hosts never change policy. */
export function stagingEmailSkipEnabled(host: string) {
  return process.env.MEMBER_EMAIL_VERIFY_STAGING_SKIP==='true' &&
    (host==='nextgen-staging.nmatunog.workers.dev' ||
      (process.env.MEMBER_LOCAL_DEMO==='true' && ['localhost','127.0.0.1'].includes(host)));
}
// This build has no real mail provider. Do not pretend to prepare/send a reset
// in the no-verification staging mode, including when member storage is offline.
export const STAGING_RESET_MESSAGE="Password reset isn't available on staging yet";
