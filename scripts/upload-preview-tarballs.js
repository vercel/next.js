// @ts-check
const fs = require('node:fs/promises')
const path = require('node:path')
const { setTimeout: sleep } = require('node:timers/promises')

const PREVIEW_BUILDS_AUDIENCE = 'https://vercel-packages.vercel.app'
const DEFAULT_PREVIEW_BUILDS_BASE_URL =
  'https://vercel-packages.vercel.app/next'

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 1000
const MAX_BODY_SNIPPET_LENGTH = 1000

/**
 * Mints a GitHub Actions OIDC token for the given audience.
 *
 * @param {string} audience
 * @returns {Promise<string>}
 */
async function mintGitHubActionsOidcToken(audience) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!requestUrl || !requestToken) {
    throw new Error(
      'ACTIONS_ID_TOKEN_REQUEST_URL is not set. ' +
        'The job needs the `id-token: write` permission.'
    )
  }

  const url = new URL(requestUrl)
  url.searchParams.set('audience', audience)
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${requestToken}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to mint GitHub OIDC token: ${response.status} ${await response.text()}`
    )
  }

  const { value } = await response.json()
  return value
}

/**
 * GitHub OIDC tokens expire about five minutes after issuance and uploading a
 * batch of tarballs can take longer, so the token is re-minted shortly before
 * it expires.
 *
 * @returns {() => Promise<string>}
 */
function createGitHubOidcTokenGetter() {
  /** @type {string | null} */
  let cachedToken = null
  let cachedTokenExpiresAt = 0

  return async () => {
    if (cachedToken !== null && cachedTokenExpiresAt - 60_000 > Date.now()) {
      return cachedToken
    }
    const token = await mintGitHubActionsOidcToken(PREVIEW_BUILDS_AUDIENCE)
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString()
    )
    cachedToken = token
    cachedTokenExpiresAt = payload.exp * 1000
    return token
  }
}

/**
 * Yields one entry per package tarball under `tarballDirectory`. Scoped
 * packages are laid out one level deeper (e.g. `@next/env/<name>.tgz`), so the
 * walk descends into any directory whose name starts with `@`.
 *
 * @param {string} tarballDirectory
 * @returns {AsyncGenerator<{ packageName: string, tarballPath: string }>}
 */
async function* findTarballs(tarballDirectory) {
  const entries = await fs.readdir(tarballDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(tarballDirectory, entry.name)
    if (entry.name.startsWith('@')) {
      const scopeEntries = await fs.readdir(entryPath, { withFileTypes: true })
      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue
        const tarballPath = await findTarballInDir(
          path.join(entryPath, scopeEntry.name)
        )
        if (tarballPath === null) continue
        yield {
          packageName: `${entry.name}/${scopeEntry.name}`,
          tarballPath,
        }
      }
    } else {
      const tarballPath = await findTarballInDir(entryPath)
      if (tarballPath === null) continue
      yield { packageName: entry.name, tarballPath }
    }
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string | null>}
 */
async function findTarballInDir(dir) {
  const files = await fs.readdir(dir)
  const tgzFile = files.find((f) => f.endsWith('.tgz'))
  return tgzFile ? path.join(dir, tgzFile) : null
}

/**
 * Formats the diagnostics of a failed response for an error message: all
 * response headers (including `x-vercel-id` on the authorize request) plus a
 * snippet of the response body.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readResponseDetails(response) {
  let details = ` Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`
  /** @type {string | null} */
  let bodySnippet = null
  try {
    const bodyText = (await response.text()).trim()
    if (bodyText !== '') {
      bodySnippet =
        bodyText.length > MAX_BODY_SNIPPET_LENGTH
          ? `${bodyText.slice(0, MAX_BODY_SNIPPET_LENGTH)}...`
          : bodyText
    }
  } catch {
    // A body that cannot be read carries no diagnostics.
  }
  if (bodySnippet !== null) {
    details += ` Response body: ${bodySnippet}`
  }
  return details
}

/**
 * Retries `fn` with exponential backoff until it succeeds or all attempts are
 * exhausted. Every failure is retried, including network-level rejections
 * where no response was received.
 *
 * @template T
 * @param {string} operationName
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withRetry(operationName, fn) {
  let attempt = 1
  while (true) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw error
      }
      const delayMs = Math.pow(2, attempt - 1) * BASE_DELAY_MS
      console.info(
        `${operationName} failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delayMs}ms:`,
        error
      )
      await sleep(delayMs)
      attempt++
    }
  }
}

/**
 * Authorizes and performs a single upload attempt for one package tarball.
 * vercel-packages authorizes the OIDC token and answers with a presigned
 * upload URL scoped to this exact blob path. The bytes flow directly to the
 * store, so the tarball size is not limited by a function's request body
 * limit.
 *
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {string} options.githubHeadSha
 * @param {string} options.packageName
 * @param {string} options.tarballPath
 * @param {() => Promise<string>} options.getOidcToken
 * @returns {Promise<string>} the download URL of the uploaded tarball
 */
async function uploadPackageTarball({
  baseUrl,
  githubHeadSha,
  packageName,
  tarballPath,
  getOidcToken,
}) {
  /** @type {Response} */
  let response
  try {
    response = await fetch(
      `${baseUrl}/commits/${githubHeadSha}/${packageName}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${await getOidcToken()}` },
      }
    )
  } catch (error) {
    throw new Error(
      `Failed to authorize the upload of ${packageName}: the request failed before a response was received`,
      { cause: error }
    )
  }

  if (response.status === 409) {
    /** @type {{ downloadUrl: string }} */
    const body = await response.json()
    // The server treats commits as immutable and rejects re-uploads once a
    // tarball exists. Re-runs legitimately re-request paths that already
    // went up (e.g. a re-run that rebuilds native packages re-requests the
    // unchanged JS-only ones), so a conflict means this package is done.
    console.info(`${packageName} is already published, skipping`)
    return body.downloadUrl
  }

  if (!response.ok && response.status !== 409) {
    throw new Error(
      `Failed to authorize the upload of ${packageName}: ${response.status}.${await readResponseDetails(response)}`
    )
  }
  /** @type {{ url: string, downloadUrl: string }} */
  const body = await response.json()

  const fileBuffer = await fs.readFile(tarballPath)
  /** @type {Response} */
  let putResponse
  try {
    putResponse = await fetch(body.url, {
      method: 'PUT',
      body: new Uint8Array(fileBuffer),
      headers: { 'content-type': 'application/gzip' },
    })
  } catch (error) {
    throw new Error(
      `Failed to upload ${packageName}: the request failed before a response was received`,
      { cause: error }
    )
  }
  if (!putResponse.ok) {
    throw new Error(
      `Failed to upload ${packageName}: ${putResponse.status}.${await readResponseDetails(putResponse)}`
    )
  }
  return body.downloadUrl
}

async function main() {
  const [githubHeadSha, tarballDirectory] = process.argv.slice(2)
  if (!githubHeadSha || !tarballDirectory) {
    throw new Error(
      'Usage: node scripts/upload-preview-tarballs.js <commitSha> <tarballDirectory>'
    )
  }

  const baseUrl =
    process.env.PREVIEW_BUILDS_BASE_URL || DEFAULT_PREVIEW_BUILDS_BASE_URL
  const getOidcToken = createGitHubOidcTokenGetter()

  /** @type {Error[]} */
  const failedUploads = []
  for await (const { packageName, tarballPath } of findTarballs(
    tarballDirectory
  )) {
    try {
      const downloadUrl = await withRetry(`Upload of ${packageName}`, () =>
        uploadPackageTarball({
          baseUrl,
          githubHeadSha,
          packageName,
          tarballPath,
          getOidcToken,
        })
      )
      console.info(`${packageName} available at ${downloadUrl}`)
    } catch (error) {
      failedUploads.push(
        new Error(`Failed to upload ${packageName}`, { cause: error })
      )
    }
  }
  if (failedUploads.length > 0) {
    // eslint-disable-next-line no-undef -- Defined in Node.js
    throw new AggregateError(
      failedUploads,
      `Failed to upload ${failedUploads.length} package(s)`
    )
  }

  console.info('All tarballs uploaded')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
