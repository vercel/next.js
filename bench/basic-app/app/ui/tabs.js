'use client'
import { describeDataLayer } from './vendor-data'
import { useState } from 'react'
export default function Tabs({ tabs, initial = 0, children }) {
  const [active, setActive] = useState(initial)
  return (
    <div className="tabs">
      <div role="tablist" className="tab-list">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            role="tab"
            aria-selected={i === active}
            className={'tab' + (i === active ? ' tab-active' : '')}
            onClick={() => setActive(i)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="tab-panel">
        {Array.isArray(children) ? children[active] : children}
      </div>
    </div>
  )
}

export const __layers = [describeDataLayer].length
