import got from 'got'
import promisePipe from 'promisepipe'
import tar from 'tar'

export type RepoInfo = {
  username: string
  name: string
  branch: string
  filePath: string
}

export async function isUrlOk(url: string) {
  const res = await got(url).catch(e => e)
  return res.statusCode === 200
}

export function getRepoInfo(
  url: URL,
  examplePath?: string
): RepoInfo | undefined {
  const [, username, name, t, _branch, ...file] = url.pathname.split('/')
  const filePath = examplePath ? examplePath.replace(/^\//, '') : file.join('/')
  // If examplePath is available, the branch name takes the entire path
  const branch = examplePath
    ? `${_branch}/${file.join('/')}`.replace(new RegExp(`/${filePath}|/$`), '')
    : _branch

  if (username && name && branch && t === 'tree') {
    return { username, name, branch, filePath }
  }
}

export function hasRepo({ username, name, branch, filePath }: RepoInfo) {
  const contentsUrl = `https://api.github.com/repos/${username}/${name}/contents`
  const packagePath = `${filePath ? `/${filePath}` : ''}/package.json`

  return isUrlOk(contentsUrl + packagePath + `?ref=${branch}`)
}

export function hasExample(name: string): Promise<boolean> {
  return isUrlOk(
    `https://api.github.com/repos/zeit/next.js/contents/examples/${encodeURIComponent(
      name
    )}/package.json`
  )
}

export function downloadAndExtractRepo(
  root: string,
  { username, name, branch, filePath }: RepoInfo
): Promise<void> {
  return promisePipe(
    got.stream(
      `https://codeload.github.com/${username}/${name}/tar.gz/${branch}`
    ),
    tar.extract(
      { cwd: root, strip: filePath ? filePath.split('/').length + 1 : 1 },
      [`${name}-${branch}${filePath ? `/${filePath}` : ''}`]
    )
  )
}

export function downloadAndExtractExample(
  root: string,
  name: string
): Promise<void> {
  return promisePipe(
    got.stream('https://codeload.github.com/zeit/next.js/tar.gz/canary'),
    tar.extract({ cwd: root, strip: 3 }, [`next.js-canary/examples/${name}`])
  )
}
