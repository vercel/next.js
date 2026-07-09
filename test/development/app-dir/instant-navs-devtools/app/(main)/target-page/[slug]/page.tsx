import { Suspense } from 'react'
import { connection } from 'next/server'
import Link from 'next/link'
import { ClientFeatures } from './client'
import { HydrationMarker } from '../../hydration-marker'

export const prefetch = 'allow-runtime'

function Box({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: '1rem',
        marginBottom: '0.75rem',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#888',
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

async function DynamicStats() {
  await connection()

  const stats = [
    { label: 'Stat one', value: '123' },
    { label: 'Stat two', value: '456' },
    { label: 'Stat three', value: '789' },
  ]

  return (
    <div data-testid="dynamic-content" style={{ display: 'flex', gap: '1rem' }}>
      {stats.map((s) => (
        <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{s.value}</div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

async function SearchParamReader({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search } = await searchParams

  return (
    <p data-testid="search-param-value" style={{ margin: 0 }}>
      <code>?search={search ?? '(none)'}</code>
    </p>
  )
}

async function ParamReader({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <p data-testid="param-value" style={{ margin: 0 }}>
      <code>slug={slug}</code>
    </p>
  )
}

export default async function TargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ search?: string }>
}) {
  return (
    <div>
      <HydrationMarker />
      <style>{`
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #eee 25%, #93c5fd 50%, #eee 75%);
          background-size: 800px 100%;
          animation: shimmer 1.5s ease-in-out infinite;
          border-radius: 4px;
        }
      `}</style>

      <h1 style={{ marginBottom: '0.25rem' }}>Target Page</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        A sandbox showing Next.js features and how they behave with Instant
        Navs.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          marginTop: '1.5rem',
        }}
      >
        {/* Server Components (left column) */}
        <div
          style={{
            background: '#fafafa',
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '0.85rem',
              marginTop: 0,
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#666',
            }}
          >
            Server Components
          </h2>

          <Box label="Static Server Content">
            <p style={{ margin: 0 }}>
              This text is rendered by a Server Component. It is static and
              renders immediately.
            </p>
          </Box>

          <Box label="Data Fetching">
            <Suspense
              fallback={
                <div
                  data-testid="dynamic-skeleton"
                  style={{ display: 'flex', gap: '1rem' }}
                >
                  {['Stat one', 'Stat two', 'Stat three'].map((label) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                        <span
                          className="skeleton"
                          style={{
                            display: 'inline-block',
                            width: 48,
                            height: '1em',
                            verticalAlign: 'middle',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#888' }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              }
            >
              <DynamicStats />
            </Suspense>
          </Box>

          <Box label="await params">
            <Suspense
              fallback={
                <p data-testid="param-skeleton" style={{ margin: 0 }}>
                  <span
                    className="skeleton"
                    style={{
                      display: 'inline-block',
                      width: 120,
                      height: '1em',
                      verticalAlign: 'middle',
                    }}
                  />
                </p>
              }
            >
              <ParamReader params={params} />
            </Suspense>
          </Box>

          <Box label="await searchParams">
            <Suspense
              fallback={
                <p data-testid="search-param-skeleton" style={{ margin: 0 }}>
                  <span
                    className="skeleton"
                    style={{
                      display: 'inline-block',
                      width: 120,
                      height: '1em',
                      verticalAlign: 'middle',
                    }}
                  />
                </p>
              }
            >
              <SearchParamReader searchParams={searchParams} />
            </Suspense>
          </Box>
        </div>

        {/* Client Components (right column) */}
        <div
          style={{
            background: '#fafafa',
            border: '1px solid #e5e5e5',
            borderRadius: 12,
            padding: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '0.85rem',
              marginTop: 0,
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#666',
            }}
          >
            Client Components
          </h2>

          <ClientFeatures />
        </div>
      </div>

      <nav style={{ marginTop: '1.5rem' }}>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          &larr; Back to home
        </Link>
      </nav>
    </div>
  )
}
