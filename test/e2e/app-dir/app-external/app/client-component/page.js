'use client'

// `transpilePackages` should still be bundled (transpiled)
import add from 'untranspiled-module'

// This should not be bundled
import text from 'cjs-module'

export default function Page() {
  return (
    <>
      <h1>{text}</h1>
      <p>{add(1, 1)}</p>
    </>
  )
}
