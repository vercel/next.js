import { createHash } from 'crypto'
import path from 'path'
import fs from 'fs-extra'

const VERCEL_API_BASE = 'https://api.vercel.com'

/**
 * A file to upload as part of a deployment.
 */
export interface DeploymentFile {
  /** Path relative to the deployment root, using forward slashes. */
  file: string
  /** SHA1 hex digest of the file contents, as expected by the files API. */
  sha: string
  size: number
  data: Buffer
}

export class VercelApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Minimal client for the Vercel REST API, used by the deploy tests instead
 * of the Vercel CLI. Authenticates with a short-lived access token vended by
 * vercel/authenticate-cli-action in CI; a plain access token works for every
 * endpoint, while the CLI gates OIDC-derived credentials per command.
 */
export class VercelApiClient {
  private readonly token: string | null
  private readonly teamSlug?: string

  constructor(token: string | null, teamSlug?: string) {
    this.token = token
    this.teamSlug = teamSlug
  }

  private buildUrl(
    pathname: string,
    query: Record<string, string> = {}
  ): string {
    const url = new URL(pathname, VERCEL_API_BASE)
    if (this.teamSlug) {
      url.searchParams.set('slug', this.teamSlug)
    }
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
    return url.toString()
  }

  private async request(
    method: string,
    pathname: string,
    {
      query,
      headers,
      body,
    }: {
      query?: Record<string, string>
      headers?: Record<string, string>
      body?: BodyInit
    } = {}
  ): Promise<Response> {
    return fetch(this.buildUrl(pathname, query), {
      method,
      headers: {
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...headers,
      },
      body,
    })
  }

  async uploadFiles(files: DeploymentFile[]): Promise<void> {
    const queue = [...files]
    const workers = Array.from(
      { length: Math.min(8, queue.length) },
      async () => {
        let file: DeploymentFile | undefined
        while ((file = queue.shift()) !== undefined) {
          const response = await this.request('POST', '/v2/files', {
            headers: {
              'content-type': 'application/octet-stream',
              'content-length': String(file.size),
              'x-vercel-digest': file.sha,
            },
            body: file.data,
          })
          if (!response.ok) {
            throw new VercelApiError(
              `Failed to upload ${file.file} (${file.size} bytes): ${await response.text()}`,
              response.status
            )
          }
        }
      }
    )
    await Promise.all(workers)
  }

  /**
   * Creates a deployment from previously uploaded files. Throws a
   * VercelApiError when the request itself fails (e.g. authentication), as
   * opposed to the deployment being created and then failing to build.
   */
  async createDeployment(input: {
    projectName: string
    files: Array<{ file: string; sha: string; size: number }>
    env: Record<string, string>
  }): Promise<{ id: string; url: string }> {
    const response = await this.request('POST', '/v13/deployments', {
      query: { forceNew: '1' },
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: input.projectName,
        project: input.projectName,
        files: input.files.map(({ file, sha, size }) => ({ file, sha, size })),
        env: input.env,
        build: { env: input.env },
      }),
    })
    if (!response.ok) {
      throw new VercelApiError(await response.text(), response.status)
    }
    const deployment = await response.json()
    return { id: deployment.id, url: deployment.url }
  }

  async getDeploymentState(idOrUrl: string): Promise<{
    readyState: string
    errorCode?: string
    errorMessage?: string
  }> {
    const response = await this.request(
      'GET',
      `/v13/deployments/${encodeURIComponent(idOrUrl)}`
    )
    if (!response.ok) {
      throw new VercelApiError(await response.text(), response.status)
    }
    const deployment = await response.json()
    return {
      readyState: deployment.readyState,
      errorCode: deployment.errorCode,
      errorMessage: deployment.errorMessage,
    }
  }

  /**
   * Polls until the deployment reaches a terminal state.
   */
  async waitForDeployment(idOrUrl: string): Promise<{
    readyState: string
    errorCode?: string
    errorMessage?: string
  }> {
    for (;;) {
      const state = await this.getDeploymentState(idOrUrl)
      if (
        state.readyState === 'READY' ||
        state.readyState === 'ERROR' ||
        state.readyState === 'CANCELED'
      ) {
        return state
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }

  /**
   * Returns the deployment's build logs as a single transcript.
   */
  async getBuildLogs(idOrUrl: string): Promise<string> {
    const response = await this.request(
      'GET',
      `/v2/deployments/${encodeURIComponent(idOrUrl)}/events`,
      { query: { builds: '1', direction: 'backward', limit: '-1' } }
    )
    if (!response.ok) {
      throw new VercelApiError(await response.text(), response.status)
    }
    const events = await response.json()
    if (!Array.isArray(events)) {
      return ''
    }
    const texts: string[] = []
    for (const event of events) {
      const text = event?.payload?.text ?? event?.text
      if (typeof text === 'string' && text !== '') {
        texts.push(text)
      }
    }
    // direction=backward returns newest events first.
    texts.reverse()
    return texts.join('\n')
  }
}

type IgnoreRule = { negated: boolean; regex: RegExp }

function compileIgnorePattern(line: string): IgnoreRule | null {
  let pattern = line.trim()
  if (pattern === '' || pattern.startsWith('#')) {
    return null
  }
  let negated = false
  if (pattern.startsWith('!')) {
    negated = true
    pattern = pattern.slice(1)
  }
  if (pattern.startsWith('/')) {
    pattern = pattern.slice(1)
  }
  if (pattern.endsWith('/')) {
    pattern = pattern.slice(0, -1)
  }
  if (pattern === '') {
    return null
  }

  // Patterns without a slash match at any depth, like .gitignore.
  const anyDepth = !pattern.includes('/')
  let source = ''
  let i = 0
  while (i < pattern.length) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // '**' crosses directory boundaries. '**/' also matches zero
        // directories.
        if (pattern[i + 2] === '/') {
          source += '(?:[^/]+/)*'
          i += 3
        } else {
          source += '.*'
          i += 2
        }
      } else {
        source += '[^/]*'
        i += 1
      }
    } else if (char === '?') {
      source += '[^/]'
      i += 1
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  // A match also covers everything below a matched directory.
  const regex = new RegExp(anyDepth ? `(^|/)${source}(/|$)` : `^${source}(/|$)`)
  return { negated, regex }
}

/**
 * Compiles .vercelignore contents into a predicate over root-relative paths
 * using forward slashes. The last matching pattern wins.
 */
export function createIgnoreMatcher(
  ignoreFileContents: string
): (relativePath: string) => boolean {
  const rules = ignoreFileContents
    .split('\n')
    .map(compileIgnorePattern)
    .filter((rule): rule is IgnoreRule => rule !== null)
  return (relativePath) => {
    let ignored = false
    for (const rule of rules) {
      if (rule.regex.test(relativePath)) {
        ignored = !rule.negated
      }
    }
    return ignored
  }
}

/**
 * Collects the files to deploy from a directory, honoring its .vercelignore.
 */
export async function collectDeploymentFiles(
  root: string
): Promise<DeploymentFile[]> {
  let isIgnored: (relativePath: string) => boolean = () => false
  try {
    isIgnored = createIgnoreMatcher(
      await fs.readFile(path.join(root, '.vercelignore'), 'utf8')
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  const files: DeploymentFile[] = []
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path
        .relative(root, absolutePath)
        .split(path.sep)
        .join('/')
      if (relativePath === '.git' || relativePath.startsWith('.git/')) {
        continue
      }
      if (isIgnored(relativePath)) {
        continue
      }
      if (entry.isDirectory()) {
        await walk(absolutePath)
      } else {
        // readFile follows symlinks, uploading the target's contents.
        const data = await fs.readFile(absolutePath)
        files.push({
          file: relativePath,
          sha: createHash('sha1').update(data).digest('hex'),
          size: data.length,
          data,
        })
      }
    }
  }
  await walk(root)
  return files
}
