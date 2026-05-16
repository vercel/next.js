'use client'
// Test both server and client compilation of ECMAScript features.

import { 'abc' as x } from './export-as-string'

export default function Page() {
  return (
    <>
      <h1>Ecmascript features test</h1>
      <pre id="values-to-check">
        {JSON.stringify(
          {
            exportAsString: x,
          },
          null,
          2
        )}
      </pre>
    </>
  )
}
