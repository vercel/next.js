import { PropsWithChildren, useState } from 'react'

function Toggler({ children }: PropsWithChildren<{}>) {
  const [showChildren, setShowChildren] = useState(true)

  return (
    <div className="toggler">
      <p>
        You can open the Network tab in your browser Dev Tools and see new
        requests being made depending on the <b>caching algorithm</b> as you
        unmount the component with the fingerprint and mount it again thus
        calling the <code>useVisitorData</code> hook.
      </p>
      <button
        className="toggle-button"
        onClick={() => setShowChildren((show) => !show)}
      >
        {showChildren ? 'Hide' : 'Show'} visitor data
      </button>
      {showChildren && children}
    </div>
  )
}

export default Toggler
