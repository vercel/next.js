// @ts-check
const fs = require('node:fs/promises')
const path = require('node:path')

const PREVIEW_BUILDS_AUDIENCE = 'https://vercel-packages.vercel.app'
const DEFAULT_PREVIEW_BUILDS_BASE_URL =
  'https://vercel-packages.vercel.app/next'

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

  for await (const { packageName, tarballPath } of findTarballs(
    tarballDirectory
  )) {
    // vercel-packages authorizes the OIDC token and answers with a presigned
    // upload URL scoped to this exact blob path. The bytes flow directly to
    // the store, so the tarball size is not limited by a function's request
    // body limit.
    const response = await fetch(
      `${baseUrl}/commits/${githubHeadSha}/${packageName}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${await getOidcToken()}` },
      }
    )
    if (!response.ok) {
      throw new Error(
        `Failed to authorize the upload of ${packageName}: ${response.status}. ` +
          `Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`
      )
    }
    const body = await response.json()

    const fileBuffer = await fs.readFile(tarballPath)
    const putResponse = await fetch(body.url, {
      method: 'PUT',
      body: new Uint8Array(fileBuffer),
      headers: { 'content-type': 'application/gzip' },
    })
    if (!putResponse.ok) {
      throw new Error(
        `Failed to upload ${packageName}: ${putResponse.status}. ` +
          `Response headers: ${JSON.stringify(Object.fromEntries(putResponse.headers))}`
      )
    }
    console.info(`Uploaded ${packageName} -> ${body.downloadUrl}`)
  }

  console.info('All tarballs uploaded')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
