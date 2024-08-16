'use client'
import * as React from 'react'
import * as ReactMarkup from 'react-markup'

function Preview() {
  return <div>Hello, Dave!</div>
}

function UnwrapPromise({ promise }) {
  return React.use(promise)
}

export default function Page() {
  const html = ReactMarkup.experimental_renderToHTML(<Preview />)
  // <pre>{promise}</pre> leads to hydration errors
  return (
    <React.Suspense fallback="rendering preview">
      <pre>
        <UnwrapPromise promise={html} />
      </pre>
    </React.Suspense>
  )
}
