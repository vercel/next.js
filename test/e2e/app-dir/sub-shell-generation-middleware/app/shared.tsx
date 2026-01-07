const { PHASE_PRODUCTION_BUILD } = require('next/constants')

function getSentinelValue() {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? 'buildtime'
    : 'runtime'
}

type Props = {
  layout: string
}

export default function SharedComponent({ layout }: Props) {
  return (
    <div data-layout={layout} data-sentinel={getSentinelValue()}>
      SharedComponent {layout} → {getSentinelValue()}
    </div>
  )
}
