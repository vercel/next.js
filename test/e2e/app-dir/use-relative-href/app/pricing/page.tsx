import { RelativeHrefs } from '../relative-hrefs'

export default function PricingPage() {
  return (
    <>
      <div id="pricing-page">Pricing</div>
      <RelativeHrefs id="pricing-page-hrefs" targets={['/chat/[id]']} />
    </>
  )
}
