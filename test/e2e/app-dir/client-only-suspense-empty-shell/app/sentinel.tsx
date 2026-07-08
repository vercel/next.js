const { PHASE_PRODUCTION_BUILD } = require('next/constants')

export function PageSentinel() {
  return (
    <div id="sentinel">
      {process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
        ? 'at buildtime'
        : 'at runtime'}
    </div>
  )
}
