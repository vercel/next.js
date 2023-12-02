import fetch from 'node-fetch'

export const TEST_PROJECT_NAME = 'vtest314-e2e-tests'
export const TEST_TEAM_NAME = process.env.VERCEL_TEST_TEAM
export const TEST_TOKEN = process.env.VERCEL_TEST_TOKEN

export async function resetProject({
  teamId = TEST_TEAM_NAME,
  projectName = TEST_PROJECT_NAME,
  disableDeploymentProtection,
}) {
  console.log(`Resetting project ${teamId}/${projectName}`)
  // TODO: error/bail if existing deployments are pending
  const deleteRes = await fetch(
    `https://vercel.com/api/v8/projects/${encodeURIComponent(
      projectName
    )}?teamId=${teamId}`,
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
    `https://vercel.com/api/v8/projects?teamId=${teamId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        framework: 'nextjs',
        name: projectName,
      }),
    }
  )

  if (!createRes.ok) {
    throw new Error(
      `Failed to create project. Got status: ${
        createRes.status
      }, ${await createRes.text()}`
    )
  }

  const { id: projectId } = await createRes.json()

  if (!projectId) {
    throw new Error("Couldn't get projectId from create project response")
  }

  if (disableDeploymentProtection) {
    console.log('Disabling deployment protection...')

    const patchRes = await fetch(
      `https://vercel.com/api/v8/projects/${encodeURIComponent(
        projectId
      )}?teamId=${teamId}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
        body: JSON.stringify({
          ssoProtection: null,
        }),
      }
    )

    if (!patchRes.ok) {
      throw new Error(
        `Failed to disable deployment protection. Got status: ${
          patchRes.status
        }, ${await patchRes.text()}`
      )
    }
  }

  console.log(
    `Successfully created fresh Vercel project ${teamId}/${projectName}`
  )
}
