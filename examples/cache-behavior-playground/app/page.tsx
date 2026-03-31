import { PlatformBadge } from './components'

const scenarios = {
  'Category A: "use cache" Directive': [
    {
      id: 'a1',
      title: 'Basic "use cache"',
      path: '/scenarios/a1-use-cache-basic',
      description: 'In-memory caching with default profile',
    },
    {
      id: 'a2',
      title: '"use cache" with cacheLife("seconds")',
      path: '/scenarios/a2-cache-life-seconds',
      description: '1s stale, 1s revalidate, 60s expire',
    },
    {
      id: 'a5',
      title: '"use cache" with cacheTag()',
      path: '/scenarios/a5-cache-tag',
      description: 'Tag assignment and invalidation',
    },
  ],
  'Category B: "use cache: remote"': [
    {
      id: 'b1',
      title: 'Basic "use cache: remote"',
      path: '/scenarios/b1-use-cache-remote',
      description: 'Remote cache storage (Runtime Cache on Vercel)',
    },
    {
      id: 'b2',
      title: 'Cross-instance persistence',
      path: '/scenarios/b2-cross-instance',
      description: 'Verify cache persists across Lambda invocations',
    },
  ],
  'Category C: unstable_cache': [
    {
      id: 'c1',
      title: 'Static context (blocking)',
      path: '/scenarios/c1-unstable-cache-static',
      description: 'Blocking revalidation during build',
    },
    {
      id: 'c2',
      title: 'Dynamic context (SWR)',
      path: '/scenarios/c2-unstable-cache-dynamic',
      description: 'Stale-while-revalidate at runtime',
    },
  ],
  'Category D: fetch Caching': [
    {
      id: 'd1',
      title: 'fetch with force-cache',
      path: '/scenarios/d1-fetch-force-cache',
      description: 'Cache forever until invalidation',
    },
    {
      id: 'd4',
      title: 'fetch with revalidate: 10',
      path: '/scenarios/d4-fetch-revalidate',
      description: 'Time-based ISR for fetch results',
    },
    {
      id: 'd6',
      title: 'fetch with tags',
      path: '/scenarios/d6-fetch-tags',
      description: 'Tag-based invalidation for fetches',
    },
  ],
  'Category E: Tag Invalidation': [
    {
      id: 'e1',
      title: 'revalidateTag() basic',
      path: '/scenarios/e1-revalidate-tag',
      description: 'Single tag invalidation',
    },
    {
      id: 'e6',
      title: 'Immediate vs SWR profile',
      path: '/scenarios/e6-immediate-vs-swr',
      description: 'Compare invalidation modes',
    },
  ],
  'Category H: Thundering Herd': [
    {
      id: 'h1',
      title: 'Concurrent requests (cold)',
      path: '/scenarios/h1-thundering-herd',
      description: 'Request coalescing behavior',
    },
  ],
}

export default function HomePage() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Next.js Cache Behavior Playground</h1>
        <PlatformBadge />
      </div>

      <p style={{ marginBottom: '2rem', color: 'var(--muted)' }}>
        65 scenarios demonstrating caching primitives across <code>next start</code> vs Vercel.
        Each scenario shows expected behavior and highlights platform differences.
      </p>

      {Object.entries(scenarios).map(([category, items]) => (
        <div key={category}>
          <div className="category-header">
            <h2>{category}</h2>
          </div>
          <div className="scenario-grid">
            {items.map((scenario) => (
              <a
                key={scenario.id}
                href={scenario.path}
                className="scenario-card"
              >
                <h3>
                  {scenario.id.toUpperCase()}: {scenario.title}
                </h3>
                <p>{scenario.description}</p>
              </a>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: '3rem', padding: '1.5rem', background: 'var(--card-bg)', borderRadius: '8px' }}>
        <h2>Quick Links</h2>
        <ul style={{ marginTop: '1rem', listStyle: 'disc', paddingLeft: '1.5rem' }}>
          <li><a href="/dashboard">Observability Dashboard</a> - Real-time cache metrics</li>
          <li><a href="/api/platform-info">Platform Info API</a> - Current platform detection</li>
          <li><a href="https://github.com/vercel/nextjs-cache-playground/blob/main/BEHAVIOR_MATRIX.md">Behavior Matrix</a> - Complete comparison table</li>
        </ul>
      </div>
    </div>
  )
}
