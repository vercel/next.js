import { SyncIOClient } from "./client"

export const unstable_instant = false

export default async function Page() {
  return (
    <main>
      <p>
        This is a blocking page with sync IO in client component. It is configured with{' '}
        <code>unstable_instant = false</code>, but it's located under a layout
        with <code>{`unstable_instant = { prefetch: 'static' }`}</code>.
        Ideally, we'd honor the static assertion and require that a static shell
        is produced.
      </p>
      <SyncIOClient />
    </main>
  )
}
