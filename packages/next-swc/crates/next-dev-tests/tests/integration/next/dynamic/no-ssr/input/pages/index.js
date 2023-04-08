import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import '../components/nested-loaded'

const Dynamic = dynamic(() => import('../components/dynamic'), {
  ssr: false,
})

let ssr = false
if (typeof document !== 'undefined') {
  ssr = document.getElementById('__next').innerText.includes('dynamic')
}

export default function Home() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(runClientSideTests)
  }, [])

  return <Dynamic />
}

function runClientSideTests(harness) {
  it('should not render the dynamic component on the server-side when ssr: false', () => {
    expect(ssr).toBe(false)
  })
  it('should render the dynamic component on client-side', async () => {
    const el = await harness.waitForSelector(document, '#dynamic')
    expect(el.innerText).toContain('dynamic')
  })
  it('should render the nested dynamic component on client-side', async () => {
    const el = await harness.waitForSelector(document, '#nested-component')
    expect(el.innerText).toContain('nested-component')
  })
  it('should render the nested already loaded dynamic component on client-side', async () => {
    const el = await harness.waitForSelector(document, '#nested-loaded')
    expect(el.innerText).toContain('nested-loaded')
  })
}
