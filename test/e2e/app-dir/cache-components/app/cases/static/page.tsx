import { getSentinelValue } from '../../getSentinelValue'

export default function Page() {
  return (
    <>
      <p>
        This page is made up of entirely static content in an sync function.
      </p>
      <p>With PPR this page should be entirely static.</p>
      <p>Without PPR this page should be static.</p>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
