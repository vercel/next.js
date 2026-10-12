import {
  resetProject,
  TEST_PROJECT_NAME,
  TEST_TEAM_NAME,
  ADAPTER_TEST_TEAM_NAME,
  ADAPTER_TEST_TOKEN,
  TURBOPACK_TEST_TEAM_NAME,
  TURBOPACK_TEST_TOKEN,
  TEST_TOKEN,
} from './reset-project.mjs'

/**
 * Every team hosting a `TEST_PROJECT_NAME` project that deploy tests deploy
 * into. Each entry records the environment variables it was read from, so that
 * a failure can point at the variables to check rather than just reporting that
 * some team could not be reset.
 */
const TEST_TEAMS = [
  {
    teamEnvVar: 'VERCEL_TEST_TEAM',
    teamId: TEST_TEAM_NAME,
    tokenEnvVar: 'VERCEL_TEST_TOKEN',
    token: TEST_TOKEN,
  },
  {
    teamEnvVar: 'VERCEL_ADAPTER_TEST_TEAM',
    teamId: ADAPTER_TEST_TEAM_NAME,
    tokenEnvVar: 'VERCEL_ADAPTER_TEST_TOKEN',
    token: ADAPTER_TEST_TOKEN,
  },
  {
    teamEnvVar: 'VERCEL_TURBOPACK_TEST_TEAM',
    teamId: TURBOPACK_TEST_TEAM_NAME,
    tokenEnvVar: 'VERCEL_TURBOPACK_TEST_TOKEN',
    token: TURBOPACK_TEST_TOKEN,
  },
]

async function main() {
  let hadFailure = false

  // Keep going after a failure so that one misconfigured or unreachable team
  // does not stop the others from being reset. `resetProject` rejects an absent
  // teamId or token itself, so this only has to say which variables to check.
  for (const { teamEnvVar, teamId, tokenEnvVar, token } of TEST_TEAMS) {
    try {
      await resetProject({
        projectName: TEST_PROJECT_NAME,
        teamId,
        token,
        disableDeploymentProtection: true,
      })
    } catch (err) {
      console.error(
        new Error(
          `Failed to reset the ${TEST_PROJECT_NAME} project for ${teamEnvVar}. Verify that ${teamEnvVar} and ${tokenEnvVar} are set correctly.`,
          { cause: err }
        )
      )
      hadFailure = true
    }
  }

  if (hadFailure) {
    throw new Error(`resetting a project failed`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
