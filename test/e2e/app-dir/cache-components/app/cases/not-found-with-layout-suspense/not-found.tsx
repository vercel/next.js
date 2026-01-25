import { getSentinelValue } from '../../getSentinelValue'

export default function NotFound() {
  return (
    <>
      <h1 id="not-found-heading">404 - Page Not Found</h1>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
