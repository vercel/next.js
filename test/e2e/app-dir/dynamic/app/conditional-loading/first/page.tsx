'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'

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

export default function ConditionalFirst() {
  const searchParams = useSearchParams()
  const [selectedComponent, setSelectedComponent] = useState('first')

  useEffect(() => {
    const component = searchParams.get('component') || 'first'
    setSelectedComponent(component)
  }, [searchParams])

  const handleNavigation = (component: string) => {
    setSelectedComponent(component)
    window.history.pushState(
      {},
      '',
      `/conditional-loading/first?component=${component}`
    )
  }

  return (
    <div>
      <h1>Conditional Dynamic Import Test</h1>

      <nav>
        <button
          id="nav-first"
          onClick={() => handleNavigation('first')}
          style={{ marginRight: '10px' }}
        >
          Load First Component
        </button>
        <button id="nav-second" onClick={() => handleNavigation('second')}>
          Load Second Component
        </button>
      </nav>

      <div id="dynamic-content">
        {selectedComponent === 'first' && <FirstComponent />}
        {selectedComponent === 'second' && <SecondComponent />}
      </div>

      <div>
        <p>Current selection: {selectedComponent}</p>
        <Link href="/conditional-loading/first?component=first" id="link-first">
          First via Link
        </Link>
        {' | '}
        <Link
          href="/conditional-loading/first?component=second"
          id="link-second"
        >
          Second via Link
        </Link>
      </div>
    </div>
  )
}
