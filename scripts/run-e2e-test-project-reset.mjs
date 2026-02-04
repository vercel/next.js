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

async function main() {
  let hadFailure = false

  for (const { teamId, token } of [
    { teamId: TEST_TEAM_NAME, token: TEST_TOKEN },
    { teamId: ADAPTER_TEST_TEAM_NAME, token: ADAPTER_TEST_TOKEN },
    { teamId: TURBOPACK_TEST_TEAM_NAME, token: TURBOPACK_TEST_TOKEN },
  ]) {
    try {
      await resetProject({
        projectName: TEST_PROJECT_NAME,
        teamId,
        token,
        disableDeploymentProtection: true,
      })
    } catch (err) {
      console.error(err)
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
