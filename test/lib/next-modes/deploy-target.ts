/**
 * Which host a deploy-mode run targets: Vercel, or another host that deploys
 * through the custom scripts described in
 * docs/01-app/03-api-reference/07-adapters/04-testing-adapters.mdx.
 *
 * This mirrors the branches in `NextDeployInstance.deploy()` — keep the two in
 * sync. An existing deployment (`NEXT_TEST_DEPLOY_URL`) takes priority there,
 * and its logs come from `vercel inspect` unless a custom logs script is set,
 * so a custom logs script is what marks it as another host. Otherwise a custom
 * deploy script does; without one the harness deploys with the Vercel CLI.
 *
 * `NEXT_ENABLE_ADAPTER` plays no part: it only selects between Vercel's
 * adapter and legacy builder, and other hosts may set it or not.
 *
 * Kept free of imports because it is read by the `@gate` conditions, which
 * load for every Jest project, including unit tests.
 */

export type DeployTarget = 'vercel' | 'custom'

export function getDeployTarget(): DeployTarget {
  if (process.env.NEXT_TEST_DEPLOY_URL?.trim()) {
    return process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH?.trim()
      ? 'custom'
      : 'vercel'
  }
  return process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH?.trim() ? 'custom' : 'vercel'
}
