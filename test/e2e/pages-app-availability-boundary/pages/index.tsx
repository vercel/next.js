import { useEffect, useState } from 'react'
// The import order matters (https://github.com/vercel/next.js/issues/99789): the `_app`-shared
// module `c-shared` sits between the boundary modules `b-boundary` and `d-boundary` (also
// imported by the `page-dyn` async chunk), so the page entry's modules get split around it.
import a from '../lib/a-page-only'
import b from '../lib/b-boundary'
import c from '../lib/c-shared'
import d from '../lib/d-boundary'
import e from '../lib/e-page'

import('../lib/page-dyn')

export default function Page() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <>
      <p id="values">{[a, b, c, d, e].join(',')}</p>
      <p id="hydrated">{hydrated ? 'yes' : 'no'}</p>
    </>
  )
}
