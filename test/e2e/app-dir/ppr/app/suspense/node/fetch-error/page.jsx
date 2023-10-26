import React, { Suspense } from 'react'

import { Dynamic } from '../../../../components/dynamic'

export default async function Page() {
  const getData = () =>
    fetch('https://example.vercel.sh', {
      cache: 'no-store',
    })
      .then((res) => res.text())
      .then((text) => new Promise((res) => setTimeout(() => res(text), 1000)))

  try {
    await getData()
  } catch (err) {}

  return (
    <>
      <h2>Dynamic Component Catching Errors</h2>
      <p>
        This shows the dynamic component that wraps a data fetch in a try/catch
      </p>
      <div id="container">
        <Suspense fallback={<Dynamic fallback />}>
          <Dynamic catchErrors />
        </Suspense>
      </div>
    </>
  )
}
