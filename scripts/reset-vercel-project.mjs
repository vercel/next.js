import fetch from 'node-fetch'

export const TEST_PROJECT_NAME = 'vtest314-e2e-tests'
export const TEST_TEAM_NAME = 'vtest314-next-e2e-tests'
export const TEST_TOKEN = process.env.VERCEL_TEST_TOKEN

async function resetProject() {
  // TODO: error/bail if existing deployments are pending
  const deleteRes = await fetch(
    `https://vercel.com/api/v8/projects/${encodeURIComponent(
      TEST_PROJECT_NAME
    )}?teamId=${TEST_TEAM_NAME}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
    }
  )

  if (!deleteRes.ok && deleteRes.status !== 404) {
    throw new Error(
      `Failed to delete project got status ${
        deleteRes.status
      }, ${await deleteRes.text()}`
    )
  }

  const createRes = await fetch(
    `https://vercel.com/api/v8/projects?teamId=${TEST_TEAM_NAME}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        framework: 'nextjs',
        name: TEST_PROJECT_NAME,
      }),
    }
  )

  if (!createRes.ok) {
    throw new Error(
      `Failed to create project got status ${
        createRes.status
      }, ${await createRes.text()}`
    )
  }

  console.log(
    `Successfully created fresh Vercel project ${TEST_TEAM_NAME}/${TEST_PROJECT_NAME}`
  )
}

if (process.env.RESET_VC_PROJECT) {
  resetProject().catch(console.error)
}
