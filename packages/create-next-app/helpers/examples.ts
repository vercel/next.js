import got from 'got'
import promisePipe from 'promisepipe'
import tar from 'tar'

export type RepoInfo = {
  username: string
  name: string
  branch: string
}

export async function isUrlOk(url: string) {
  const res = await got(url).catch(e => e)
  return res.statusCode === 200
}

export function getRepoInfo(url: URL): RepoInfo | undefined {
  const [, username, name, tree, ..._branch] = url.pathname.split('/')
  const branch = _branch.join('/')

  if (username && name && branch && tree === 'tree') {
    return { username, name, branch }
  }
}

export function hasRepo({ username, name, branch }: RepoInfo) {
  return isUrlOk(
    `https://api.github.com/repos/${username}/${name}/contents/package.json?ref=${branch}`
  )
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
  { username, name, branch }: RepoInfo
): Promise<void> {
  return promisePipe(
    got.stream(
      `https://codeload.github.com/${username}/${name}/tar.gz/${branch}`
    ),
    tar.extract({ cwd: root, strip: 1 }, [`${name}-${branch}`])
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
