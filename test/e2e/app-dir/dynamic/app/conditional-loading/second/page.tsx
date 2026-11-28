'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const FirstComponent = dynamic(
  () => import('../../../components/first-dynamic'),
  {
    loading: () => <div>Loading First...</div>,
  }
)

const SecondComponent = dynamic(
  () => import('../../../components/second-dynamic'),
  {
    loading: () => <div>Loading Second...</div>,
  }
)

export default function ConditionalSecond() {
  const searchParams = useSearchParams()
  const [selectedComponent, setSelectedComponent] = useState('second')

  useEffect(() => {
    const component = searchParams.get('component') || 'second'
    setSelectedComponent(component)
  }, [searchParams])

  return (
    <div>
      <h1>Conditional Dynamic Import Test - Second</h1>

      <div id="dynamic-content">
        {selectedComponent === 'first' && <FirstComponent />}
        {selectedComponent === 'second' && <SecondComponent />}
      </div>

      <div>
        <p>Current selection: {selectedComponent}</p>
      </div>
    </div>
  )
}
