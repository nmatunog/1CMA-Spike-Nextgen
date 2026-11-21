export const HOSTED_MEMBER_HOST='nextgen-staging.nmatunog.workers.dev';
export const HOSTED_MEMBER_ORIGIN=`https://${HOSTED_MEMBER_HOST}`;
export function hostedStagingEnabled(host: string) {
  return process.env.MEMBER_HOSTED_STAGING_ENABLED==='true' && host===HOSTED_MEMBER_HOST;
}
export function loopbackHost(host: string) {return host==='localhost'||host==='127.0.0.1';}
