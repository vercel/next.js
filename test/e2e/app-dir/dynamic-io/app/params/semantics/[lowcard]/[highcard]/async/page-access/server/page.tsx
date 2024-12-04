import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default async function Page({
  params,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
}) {
  return (
    <section>
      <p>
        This Page access params in a page component inside a high cardinality
        and low cardinality dynamic params
      </p>
      <div>
        page lowcard: <span id="param-lowcard">{(await params).lowcard}</span>
      </div>
      <div>
        page highcard:{' '}
        <span id="param-highcard">{(await params).highcard}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
    </section>
  )
}
