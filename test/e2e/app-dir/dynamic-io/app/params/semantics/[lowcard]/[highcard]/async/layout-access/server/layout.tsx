import { getSentinelValue } from '../../../../../../../getSentinelValue'

export default async function Page({
  params,
  children,
}: {
  params: Promise<{ lowcard: string; highcard: string }>
  children: React.ReactNode
}) {
  return (
    <section>
      <p>
        This Layout accesses params in a server component inside a high
        cardinality and low cardinality dynamic params
      </p>
      <div>
        page lowcard: <span id="param-lowcard">{(await params).lowcard}</span>
      </div>
      <div>
        page highcard:{' '}
        <span id="param-highcard">{(await params).highcard}</span>
      </div>
      <span id="page">{getSentinelValue()}</span>
      {children}
    </section>
  )
}
