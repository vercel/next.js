import { getSentinelValue } from '../../getSentinelValue'

export default function NotFound() {
  return (
    <>
      <p>
        This 404 page is made up of entirely static content in a sync function.
      </p>
      <p>With PPR this page should be entirely static.</p>
      <p>Without PPR this page should be static.</p>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
