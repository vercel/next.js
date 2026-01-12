import { getSentinelValue } from '../../getSentinelValue'

export default function NotFound() {
  return (
    <>
      <p id="not-found-component">Not Found from Suspense!</p>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}
