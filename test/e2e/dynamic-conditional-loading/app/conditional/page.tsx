'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const FirstComponent = dynamic(
  () => import('../../components/first-component'),
  {
    loading: () => <div>Loading First...</div>,
  }
)

const SecondComponent = dynamic(
  () => import('../../components/second-component'),
  {
    loading: () => <div>Loading Second...</div>,
  }
)

export default function ConditionalPage() {
  const searchParams = useSearchParams()
  const [selectedComponent, setSelectedComponent] = useState('')

  useEffect(() => {
    const component = searchParams.get('component')
    if (component) {
      setSelectedComponent(component)
    }
  }, [searchParams])

  const handleNavigation = (component: string) => {
    setSelectedComponent(component)
    window.history.pushState({}, '', `/conditional?component=${component}`)
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
        {!selectedComponent && <div>No component selected</div>}
      </div>

      <div>
        <p>Current selection: {selectedComponent || 'none'}</p>
        <Link href="/conditional?component=first" id="link-first">
          First via Link
        </Link>
        {' | '}
        <Link href="/conditional?component=second" id="link-second">
          Second via Link
        </Link>
      </div>
    </div>
  )
}
