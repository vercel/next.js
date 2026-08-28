import fetch from 'node-fetch'

export const TEST_PROJECT_NAME = 'vtest314-e2e-tests'
export const TEST_TEAM_NAME = process.env.VERCEL_TEST_TEAM
export const TEST_TOKEN = process.env.VERCEL_TEST_TOKEN

export const ADAPTER_TEST_TEAM_NAME = process.env.VERCEL_ADAPTER_TEST_TEAM
export const ADAPTER_TEST_TOKEN = process.env.VERCEL_ADAPTER_TEST_TOKEN

export const TURBOPACK_TEST_TEAM_NAME = process.env.VERCEL_TURBOPACK_TEST_TEAM
export const TURBOPACK_TEST_TOKEN = process.env.VERCEL_TURBOPACK_TEST_TOKEN

/**
 * Whether a value read from the environment carries no usable value. An unset
 * variable reads as `undefined`, while one set to an empty value reads as `''`;
 * neither can identify a team or authenticate against one.
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function isAbsent(value) {
  return value === undefined || value === null || value === ''
}

/**
 * Retry a fetch request with exponential backoff
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @param {object} config - Retry configuration
 * @param {number} config.maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number[]} config.acceptableStatuses - Status codes that are acceptable and should not retry (default: [])
 * @param {string} config.operationName - Name of the operation for logging (default: 'Request')
 * @returns {Promise<Response>} The fetch response
 */
async function fetchWithRetry(
  url,
  options = {},
  { maxRetries = 5, acceptableStatuses = [], operationName = 'Request' } = {}
) {
  let lastError
  let response

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    response = await fetch(url, options)

    // Check if response is acceptable
    if (response.ok || acceptableStatuses.includes(response.status)) {
      return response
    }

    // If we have attempts remaining, retry
    if (attempt < maxRetries - 1) {
      const delay = Math.pow(2, attempt) * 1000 // exponential backoff: 1s, 2s, 4s, 8s, 16s
      const errorText = await response.text()
      console.log(
        `${operationName} failed with status ${response.status} (attempt ${attempt + 1}/${maxRetries}), waiting ${delay}ms before retrying...`
      )
      lastError = `${operationName} failed. Got status: ${response.status}, ${errorText}`
      await new Promise((resolve) => setTimeout(resolve, delay))
      continue
    }

    // Last attempt failed, capture error
    lastError = `${operationName} failed. Got status: ${
      response.status
    }, ${await response.text()}`
  }

  // All retries exhausted
  throw new Error(lastError)
}

export async function resetProject({
  teamId,
  projectName,
  token,
  disableDeploymentProtection = true,
}) {
  // `teamId`, `projectName` and `token` together decide which project gets
  // deleted and recreated, so all three are deliberately required. Defaulting
  // any of them meant a caller passing an unset value silently destroyed some
  // other project instead of the one it meant to reset.
  if (isAbsent(teamId)) {
    throw new Error('resetProject requires a teamId.')
  }
  if (isAbsent(projectName)) {
    throw new Error(`resetProject requires a projectName for team ${teamId}.`)
  }
  if (isAbsent(token)) {
    throw new Error(`resetProject requires a token for team ${teamId}.`)
  }

  console.log(`Resetting project ${teamId}/${projectName}`)
  // TODO: error/bail if existing deployments are pending
  await fetchWithRetry(
    `https://vercel.com/api/v8/projects/${encodeURIComponent(
      projectName
    )}?teamId=${teamId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    {
      acceptableStatuses: [404], // 404 is acceptable (project doesn't exist)
      operationName: 'Delete project',
    }
  )

  // Retry logic for project creation since deletion may be async
  const createRes = await fetchWithRetry(
    `https://vercel.com/api/v8/projects?teamId=${teamId}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: projectName,
        framework: 'nextjs',
        resourceConfig: {
          buildMachineType: 'enhanced',
        },
        environmentVariables: [
          {
            key: 'VERCEL_FORCE_NO_BUILD_CACHE_UPLOAD',
            value: '1',
            type: 'plain',
            target: ['production', 'preview', 'development'],
          },
        ],
      }),
    },
    {
      operationName: 'Create project',
    }
  )

  const { id: projectId } = await createRes.json()

  if (!projectId) {
    throw new Error("Couldn't get projectId from create project response")
  }

  if (disableDeploymentProtection) {
    console.log('Disabling deployment protection...')

    await fetchWithRetry(
      `https://vercel.com/api/v8/projects/${encodeURIComponent(
        projectId
      )}?teamId=${teamId}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ssoProtection: null,
          passwordProtection: null,
        }),
      },
      {
        operationName: 'Disable deployment protection',
      }
    )
  }

  console.log(
    `Successfully created fresh Vercel project ${teamId}/${projectName}`
  )
}
