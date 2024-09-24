import {
  resetProject,
  TEST_PROJECT_NAME,
  TEST_TEAM_NAME,
} from './reset-project.mjs'

resetProject({
  projectName: TEST_PROJECT_NAME,
  teamId: TEST_TEAM_NAME,
  disableDeploymentProtection: true,
}).catch(console.error)
