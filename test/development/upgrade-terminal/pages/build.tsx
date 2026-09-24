import { existsSync, watch, writeFileSync } from 'node:fs'

export async function getStaticProps() {
  // Tell the terminal test that compilation reached static generation, then
  // wait for its choice so the build cannot finish before the assertion.
  writeFileSync('build-progress', '')
  writeFileSync('build-worker-pid', String(process.pid))
  await new Promise<void>((resolve) => {
    const watcher = watch('.', (_event, filename) => {
      if (filename === 'release-build' && existsSync('release-build')) {
        watcher.close()
        resolve()
      }
    })
    if (existsSync('release-build')) {
      watcher.close()
      resolve()
    }
  })
  return { props: {} }
}

export default function BuildPage() {
  return <p>build</p>
}
