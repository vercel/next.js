'use client'

import { Suspense } from 'react'
import { useSearchParams, usePathname, useParams } from 'next/navigation'

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

function PathnameDisplay() {
  const pathname = usePathname()

  return (
    <p style={{ margin: 0 }}>
      <code>{pathname}</code>
    </p>
  )
}

function ParamsDisplay() {
  const params = useParams()

  return (
    <p style={{ margin: 0 }} data-testid="client-params">
      <code>slug={String(params.slug ?? '(none)')}</code>
    </p>
  )
}

function SearchParamsDisplay() {
  const searchParams = useSearchParams()

  return (
    <p style={{ margin: 0 }} data-testid="client-search-param">
      <code>?search={searchParams.get('search') ?? '(none)'}</code>
    </p>
  )
}

export function ClientFeatures() {
  return (
    <>
      <Box label="Static Client Content">
        <p style={{ margin: 0 }}>
          This text is rendered by a Client Component. It is part of the JS
          bundle and renders immediately.
        </p>
      </Box>

      <Box label="usePathname()">
        <Suspense
          fallback={
            <p style={{ margin: 0 }}>
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
          <PathnameDisplay />
        </Suspense>
      </Box>

      <Box label="useParams()">
        <Suspense
          fallback={
            <p style={{ margin: 0 }}>
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
          <ParamsDisplay />
        </Suspense>
      </Box>

      <Box label="useSearchParams()">
        <Suspense
          fallback={
            <p style={{ margin: 0 }}>
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
          <SearchParamsDisplay />
        </Suspense>
      </Box>
    </>
  )
}
