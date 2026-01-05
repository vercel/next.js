'use client'

import dynamic from 'next/dynamic'
import { useState, Suspense, ComponentType } from 'react'

// Lazy component that loads slowly - gives you time to block in DevTools
const SlowLazyComponent = dynamic(
  () =>
    new Promise<{ default: ComponentType }>((resolve) => {
      // 3 second delay before loading the actual component
      setTimeout(() => {
        import('../../components/lazy-component').then(resolve)
      }, 3000)
    }),
  { ssr: false }
)

// This will always fail with a ChunkLoadError
const FailingLazyComponent = dynamic(
  () =>
    new Promise<{ default: ComponentType }>((_resolve, reject) => {
      setTimeout(() => {
        const error = new Error(
          'Failed to load chunk /_next/static/chunks/fake-chunk.js'
        )
        error.name = 'ChunkLoadError'
        reject(error)
      }, 500)
    }),
  { ssr: false }
)

export default function DebugPage() {
  const [showSlow, setShowSlow] = useState(false)
  const [showFailing, setShowFailing] = useState(false)
  const [throwDirectly, setThrowDirectly] = useState(false)

  // Direct throw to test error boundary
  if (throwDirectly) {
    const error = new Error(
      'Failed to load chunk /_next/static/chunks/direct-throw-chunk.js'
    )
    error.name = 'ChunkLoadError'
    throw error
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h1>Chunk Error Debug Page</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Use these buttons to test chunk loading errors locally.
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '500px',
        }}
      >
        {/* Method 1: Fake ChunkLoadError via dynamic import */}
        <div
          style={{
            padding: '16px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0' }}>1. Fake ChunkLoadError</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
            Triggers a dynamic import that fails with ChunkLoadError after
            500ms.
          </p>
          <button
            onClick={() => setShowFailing(true)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Load Failing Component
          </button>
          {showFailing && (
            <Suspense fallback={<div>Loading (will fail)...</div>}>
              <FailingLazyComponent />
            </Suspense>
          )}
        </div>

        {/* Method 2: Direct throw */}
        <div
          style={{
            padding: '16px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0' }}>2. Direct Throw</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
            Directly throws a ChunkLoadError from the render function.
          </p>
          <button
            onClick={() => setThrowDirectly(true)}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Throw ChunkLoadError
          </button>
        </div>

        {/* Method 3: Slow component for DevTools blocking */}
        <div
          style={{
            padding: '16px',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0' }}>3. Manual Block (DevTools)</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
            Loads a component with 3s delay. Open DevTools &gt; Network &gt;
            Block request pattern &quot;*lazy-component*&quot; before it loads.
          </p>
          <button
            onClick={() => setShowSlow(true)}
            disabled={showSlow}
            style={{
              padding: '8px 16px',
              cursor: showSlow ? 'not-allowed' : 'pointer',
              background: showSlow ? '#ccc' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            {showSlow ? 'Loading...' : 'Load Slow Component'}
          </button>
          {showSlow && (
            <Suspense fallback={<div>Loading in 3 seconds...</div>}>
              <SlowLazyComponent />
            </Suspense>
          )}
        </div>

        {/* Instructions */}
        <div
          style={{
            padding: '16px',
            background: '#f5f5f5',
            borderRadius: '8px',
            fontSize: '14px',
          }}
        >
          <h4 style={{ margin: '0 0 8px 0' }}>How to test:</h4>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>
              <strong>Option 1:</strong> Click "Load Failing Component" - This
              simulates a ChunkLoadError immediately.
            </li>
            <li>
              <strong>Option 2:</strong> Click "Throw ChunkLoadError" - This
              throws directly from render.
            </li>
            <li>
              <strong>Option 3:</strong> Open DevTools, go to Network tab, add
              request blocking for "*lazy-component*", then click "Load Slow
              Component".
            </li>
          </ol>
        </div>
      </div>

      <div
        style={{ marginTop: '20px', padding: '10px', background: '#e0f0e0' }}
      >
        <strong>Page content that should be preserved:</strong>
        <p>
          If the banner works correctly, this content should remain visible
          (frozen) behind the banner.
        </p>
      </div>
    </div>
  )
}
