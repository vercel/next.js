import got from 'got'
import promisePipe from 'promisepipe'
import tar from 'tar'

export async function hasExample(name: string): Promise<boolean> {
  const res = await got(
    `https://api.github.com/repos/zeit/next.js/contents/examples/${encodeURIComponent(
      name
    )}/package.json`
  ).catch(e => e)
  return res.statusCode === 200
}

export async function downloadAndExtractExample(
  root: string,
  name: string
): Promise<void> {
  return await promisePipe(
    got.stream('https://codeload.github.com/zeit/next.js/tar.gz/canary'),
    tar.extract({ cwd: root, strip: 3 }, [`next.js-canary/examples/${name}`])
  )
}
