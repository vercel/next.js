export function generateStaticParams() {
  return ['1', '2', '3', '4', '5', '6'].map((id) => ({ id }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Logged by the static worker while prerendering: forwarded to the build
  // output.
  console.log(`static-worker-fork-server: prerendering post ${id}`)
  console.error(`static-worker-fork-server: stderr for post ${id}`)
  // On Linux, report whether the worker was spawned by the fork server (its
  // parent is the fork server's helper process) or forked by `next build`.
  if (process.platform === 'linux') {
    const { readFileSync } = await import('fs')
    const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8')
    console.log(
      `static-worker-fork-server: spawned by fork server ${parent.includes('fork-server-child')}`
    )
  }
  return <p>post {id}</p>
}
