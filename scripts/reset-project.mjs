import fetch from 'node-fetch'

// env variables may come from Action variables which are not available on forks.
// We're using Action variables to allow reusing the same workflow in mirrors that don't use forks.
export const TEST_PROJECT_NAME = 'vtest314-e2e-tests'
export const TEST_TEAM_NAME = process.env.VERCEL_TEST_TEAM
export const TEST_TOKEN_URL =
  process.env.DEPLOY_E2E_TEST_TOKEN_URL ??
  'https://vtest314-e2e-tests-pfy5atx4h-vtest314-next-e2e-tests.vercel.app/deploy-e2e-test-token'

export const ADAPTER_TEST_TEAM_NAME = process.env.VERCEL_ADAPTER_TEST_TEAM
export const ADAPTER_TEST_TOKEN_URL =
  process.env.DEPLOY_E2E_TEST_ADAPTER_TOKEN_URL ??
  'https://vtest314-e2e-tests-n8uf9i2rc-vtest314-next-adapter-e2e-tests.vercel.app/deploy-e2e-test-token'

export const TURBOPACK_TEST_TEAM_NAME = process.env.VERCEL_TURBOPACK_TEST_TEAM
export const TURBOPACK_TEST_TOKEN_URL =
  process.env.DEPLOY_E2E_TEST_TURBOPACK_TOKEN_URL ??
  'https://vtest314-e2e-tests-lchz4ri4z-vtest314-next-turbo-e2e-tests.vercel.app/deploy-e2e-test-token'

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
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options)

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
      await new Promise((resolve) => setTimeout(resolve, delay))
    } else {
      // Last attempt failed, capture error
      throw new Error(`${operationName} failed: ${await response.text()}`, {
        cause: {
          url: response.url,
          status: response.status,
          statusText: response.statusText,
          headers: JSON.stringify(
            Object.fromEntries(response.headers.entries())
          ),
        },
      })
    }
  }

  throw new Error('Unreachable code reached in fetchWithRetry')
}

/**
 * Mint a short-lived Vercel OIDC token by exchanging the job's GitHub OIDC
 * token at the given exchange endpoint. Requires the job to have the
 * `id-token: write` permission, which provides the ACTIONS_ID_TOKEN_REQUEST_*
 * environment variables.
 */
function decodeJwtClaims(jwt) {
  return JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')
  )
}

export async function mintVercelOidcToken(tokenUrl) {
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const repository = process.env.GITHUB_REPOSITORY
  if (!requestToken || !requestUrl || !repository) {
    throw new Error(
      'Cannot mint a Vercel OIDC token outside of a GitHub Actions job with the `id-token: write` permission.'
    )
  }

  // The exchange endpoint expects the audience to be the repository the job
  // runs in, so the same code works in any repo.
  const oidcRequestUrl = new URL(requestUrl)
  oidcRequestUrl.searchParams.set(
    'audience',
    `https://github.com/${repository}`
  )
  const oidcResponse = await fetchWithRetry(
    oidcRequestUrl.toString(),
    { headers: { authorization: `bearer ${requestToken}` } },
    { operationName: 'GitHub OIDC token request' }
  )
  const { value: gitHubOidcToken } = await oidcResponse.json()
  console.log(
    'GitHub OIDC token claims:',
    JSON.stringify(decodeJwtClaims(gitHubOidcToken), null, 2)
  )

  // Fork PR runs only receive a read-only GITHUB_TOKEN, so the exchange
  // endpoint uses the presented token's repository permissions as proof
  // that the run comes from the repository itself.
  //
  // The GitHub OIDC token is also sent as `x-vercel-trusted-oidc-idp-token`
  // so the request passes Vercel Deployment Protection on the vending app
  // when it is enabled, without a static bypass secret.
  const exchangeHeaders = {
    authorization: `Bearer ${gitHubOidcToken}`,
    'x-vercel-trusted-oidc-idp-token': gitHubOidcToken,
  }
  if (process.env.GITHUB_TOKEN) {
    exchangeHeaders['x-github-token'] = process.env.GITHUB_TOKEN
  }

  const exchangeResponse = await fetchWithRetry(
    tokenUrl,
    { headers: exchangeHeaders },
    {
      // Authorization failures won't fix themselves by retrying.
      acceptableStatuses: [401, 403],
      operationName: 'Vercel deploy token exchange',
    }
  )
  if (!exchangeResponse.ok) {
    throw new Error(
      `Vercel deploy token exchange failed: ${await exchangeResponse.text()}`,
      {
        cause: {
          url: exchangeResponse.url,
          status: exchangeResponse.status,
          statusText: exchangeResponse.statusText,
          headers: JSON.stringify(
            Object.fromEntries(exchangeResponse.headers.entries())
          ),
        },
      }
    )
  }
  const { token } = await exchangeResponse.json()
  console.log(
    'Vercel OIDC token claims:',
    JSON.stringify(decodeJwtClaims(token), null, 2)
  )
  return token
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
