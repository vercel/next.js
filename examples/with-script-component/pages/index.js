import { useState } from "react"

import Analytics from "../components/Analytics"

export default function Home() {
  const [analytics, setAnalytics] = useState(null)

  function handleEvent() {
    analytics.track('test')
  }

  return (
    <div>
      <h1>
        Open Dev Tools network panel to inspect events
      </h1>
      <nav>
        <button onClick={handleEvent}>Track event</button>
      </nav>
      <Analytics onLoad={setAnalytics} />
    </div>
  )
}
