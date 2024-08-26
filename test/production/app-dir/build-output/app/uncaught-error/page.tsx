import { PHASE_PRODUCTION_BUILD } from 'next/constants'

export default function Page() {
  setTimeout(() => {
    throw new Error('Boom')
  }, 0)
  return (
    <>
      <p>
        This page should be statically generated even though we threw an
        unhandled exception in a setTimeout.
      </p>
      <p id="sentinel">
        {process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
          ? 'at buildtime'
          : 'at runtime'}
      </p>
    </>
  )
}
