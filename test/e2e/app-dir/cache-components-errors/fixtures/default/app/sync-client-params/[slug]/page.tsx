'use client'

export default function Page({ params }) {
  return (
    <>
      <p>
        This page accesses params synchronously. This does not trigger dynamic,
        and the build should succeed. In dev mode, we do log an error for the
        sync access though.
      </p>
      <ParamsReadingComponent params={params} />
    </>
  )
}

function ParamsReadingComponent({ params }) {
  return (
    <div>
      this component read the `slug` param synchronously:{' '}
      <span id="param">{String(params.slug)}</span>
    </div>
  )
}
