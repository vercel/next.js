// Incremented on every render. Module state must survive anything that
// doesn't change this module's code: if this resets, the server re-evaluated
// the module.
let renderCount = 0

async function getCachedData() {
  'use cache'
  await new Promise((r) => setTimeout(r))
  return Math.random()
}

export default async function Page() {
  renderCount++
  const data = await getCachedData()
  return (
    <main>
      <p>
        This page renders cached data. The cached value must be stable across
        reloads unless this page (or the data it depends on) is edited.
      </p>
      <dl>
        <dt>Cached Data</dt>
        <dd id="cached-value">{data}</dd>
        <dt>Env</dt>
        <dd id="env-value">
          {process.env.NEXT_PUBLIC_CACHE_BUSTER ?? 'unset'}
        </dd>
        <dt>Render Count</dt>
        <dd id="render-count">{renderCount}</dd>
        <dt>Runtime Env</dt>
        {/* Not prefixed with NEXT_PUBLIC_, so it's read at render time and
            changing it doesn't affect the compiled output. */}
        <dd id="runtime-env-value">
          {process.env.RUNTIME_GREETING ?? 'unset'}
        </dd>
      </dl>
    </main>
  )
}
