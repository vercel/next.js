'use client'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(runTests)
}

function runTests() {
  it('should link to imported image', async () => {
    const img = document.querySelector('#imported')
    expect(img.src).toContain(encodeURIComponent('_next/static/assets'))

    const res = await fetch(img.src)
    expect(res.status).toBe(200)
  })
}
