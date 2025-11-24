'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

function Tab0() {
  return 'Intentionally empty'
}

function Tab1() {
  return <Link href="/memory-pressure/0">Link 0</Link>
}

function Tab2() {
  const links = []
  for (let i = 1; i < 60; i++) {
    links.push(<Link href={'/memory-pressure/' + i}>Link {i}</Link>)
  }
  return links
}

export default function MemoryPressure() {
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState('0')

  const handlePageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedTab(event.target.value)
  }

  let tab
  switch (selectedTab) {
    case '0':
      tab = <Tab0 />
      break
    case '1':
      tab = <Tab1 />
      break
    case '2':
      tab = <Tab2 />
      break
    default:
      tab = null
      break
  }

  return (
    <form>
      <h1>Memory pressure</h1>
      <p>
        Tests that prefetch data is evicted once the cache size grows too large,
        using an LRU.
      </p>
      <p>
        On page load, the first link is preloaded. When you switch to the second
        tab, the first link is replaced by a large number of a new links.
      </p>
      <p>The payload for each link's prefetch is about 1MB.</p>
      <p>
        Switching tabs causes the cache size to exceed the limit{' '}
        <em>
          (currently hardcoded to 50MB, but we will make this configurable)
        </em>
        , and the prefetch for the first link will be evicted.
      </p>
      <div>
        <button
          id="navigate-to-link-0"
          formAction={() => {
            // Intentionally using the imperative API instead of a Link so that
            // the presence of the button does not affect the
            // prefetching behavior.
            router.push('/memory-pressure/0')
          }}
        >
          Navigate to link 0
        </button>
      </div>
      <div>
        <label>
          <input
            type="radio"
            value="0"
            checked={selectedTab === '0'}
            onChange={handlePageChange}
            name="tabSelection"
          />
          Tab 0
        </label>
      </div>
      <div>
        <label>
          <input
            type="radio"
            value="1"
            checked={selectedTab === '1'}
            onChange={handlePageChange}
            name="tabSelection"
          />
          Tab 1
        </label>
      </div>
      <div>
        <label>
          <input
            type="radio"
            value="2"
            checked={selectedTab === '2'}
            onChange={handlePageChange}
            name="tabSelection"
          />
          Tab 2
        </label>
      </div>
      <div>{tab}</div>
    </form>
  )
}
