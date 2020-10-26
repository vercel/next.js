export const getDsn = () =>
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

export const getRelease = () =>
  process.env.SENTRY_RELEASE ||
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
  process.env.VERCEL_GITHUB_COMMIT_SHA ||
  process.env.VERCEL_GITLAB_COMMIT_SHA ||
  process.env.VERCEL_BITBUCKET_COMMIT_SHA
