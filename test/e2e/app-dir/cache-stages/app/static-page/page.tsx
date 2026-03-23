import { unstable_navigation } from 'next/cache'

// No unstable_instant config — this page is fully static.

async function ContentAfterNavigationCall() {
  'use cache'
  await unstable_navigation()
  return <p id="static-after-nav">Static content after navigation()</p>
}

export default function Page() {
  return (
    <div>
      <p id="static-before-nav">Static content before navigation()</p>
      <ContentAfterNavigationCall />
    </div>
  )
}
