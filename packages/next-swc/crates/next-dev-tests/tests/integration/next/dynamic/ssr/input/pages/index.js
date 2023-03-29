import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import '../components/nested-loaded'

const Dynamic = dynamic(() => import('../components/dynamic'))

let ssrDynamic = false
let ssrNested = false
let ssrNestedLoaded = false
if (typeof document !== 'undefined') {
  const innerText = document.getElementById('__next').innerText
  ssrDynamic = innerText.includes('dynamic')
  ssrNested = innerText.includes('nested-component')
  ssrNestedLoaded = innerText.includes('nested-loaded')
}

export default function Home() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(runClientSideTests)
  }, [])

  return <Dynamic />
}

function runClientSideTests(harness) {
  it('should render the dynamic component on the server-side', () => {
    expect(ssrDynamic).toBe(true)
  })
  it('should render the nested dynamic component on the server-side', () => {
    expect(ssrNested).toBe(true)
  })
  it('should render the nested already loaded dynamic component on the server-side', () => {
    expect(ssrNestedLoaded).toBe(true)
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
