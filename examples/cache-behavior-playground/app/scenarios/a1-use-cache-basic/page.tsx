import { cacheLife, cacheTag } from 'next/cache'
import { CacheIndicator, TimestampDisplay, PlatformBadge } from '../../components'
import { revalidateBasicCache } from './actions'
import { RevalidateButton } from '../../components/RevalidateButton'

async function getCachedData() {
  'use cache'
  cacheLife('default')
  cacheTag('a1-basic')

  // Simulate slow data fetch
  await new Promise((r) => setTimeout(r, 100))

  return {
    timestamp: Date.now(),
    random: Math.random(),
    instanceId: process.env.VERCEL_DEPLOYMENT_ID?.slice(-8) || `local-${process.pid}`,
    source: 'a1-use-cache-basic',
  }
}

export default async function Page() {
  const data = await getCachedData()
  const renderTime = Date.now()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>A1: Basic "use cache"</h1>
        <PlatformBadge />
      </div>

      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Demonstrates basic <code>"use cache"</code> directive behavior. Uses in-memory LRU cache.
      </p>

      <div className="card">
        <h2>Cache Status</h2>
        <CacheIndicator generatedAt={data.timestamp} receivedAt={renderTime} />
      </div>

      <div className="card">
        <h2>Data</h2>
        <TimestampDisplay data={data} renderTime={renderTime} />
      </div>

      <div className="card">
        <h2>Actions</h2>
        <RevalidateButton action={revalidateBasicCache} label="Revalidate Tag" />
        <p style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
          Click to invalidate the <code>a1-basic</code> tag
        </p>
      </div>

      <section className="expected-behavior">
        <h2>Expected Behavior</h2>
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Request 1</th>
              <th>Request 2 (same instance)</th>
              <th>Request 2 (new instance)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>next dev</td>
              <td>Fresh</td>
              <td>Cached</td>
              <td>Cached (dev server persists)</td>
            </tr>
            <tr>
              <td>next start</td>
              <td>Fresh</td>
              <td>Cached</td>
              <td>Fresh (new process = new LRU)</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Fresh</td>
              <td><strong>Fresh (NOOP - no persistence)</strong></td>
              <td>Fresh</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2>Code</h2>
        <pre>{`async function getCachedData() {
  'use cache'
  cacheLife('default')
  cacheTag('a1-basic')

  return {
    timestamp: Date.now(),
    random: Math.random(),
  }
}`}</pre>
      </div>

      <div className="card">
        <h2>Key Insight</h2>
        <p>
          <strong>On Vercel:</strong> <code>"use cache"</code> without <code>: remote</code> uses
          in-memory storage only. Since serverless functions are ephemeral, the cache is
          effectively a noop - each Lambda invocation starts with an empty cache.
        </p>
        <p style={{ marginTop: '1rem' }}>
          <strong>Solution:</strong> Use <code>"use cache: remote"</code> for persistent caching
          on Vercel (uses Runtime Cache KV).
        </p>
      </div>
    </div>
  )
}
