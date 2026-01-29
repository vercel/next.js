import {
  resetProject,
  TEST_PROJECT_NAME,
  TEST_TEAM_NAME,
  ADAPTER_TEST_TEAM_NAME,
  ADAPTER_TEST_TOKEN,
  TEST_TOKEN,
} from './reset-project.mjs'

async function main() {
  let hadFailure = false

  await resetProject({
    projectName: TEST_PROJECT_NAME,
    teamId: TEST_TEAM_NAME,
    token: TEST_TOKEN,
    disableDeploymentProtection: true,
  }).catch((err) => {
    console.error(err)
    hadFailure = true
  })

  await resetProject({
    projectName: TEST_PROJECT_NAME,
    teamId: ADAPTER_TEST_TEAM_NAME,
    token: ADAPTER_TEST_TOKEN,
    disableDeploymentProtection: true,
  }).catch((err) => {
    console.error(err)
    hadFailure = true
  })

  if (hadFailure) {
    throw new Error(`resetting a project failed`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
