import { useEffect } from 'react'
import MagicImage from 'magic-image'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return <MagicImage />
}

function runTests() {
  it('it should link to imported image from a package', function () {
    const img = document.querySelector('#magic')
    expect(img.src).toContain(encodeURIComponent('_next/static/assets'))
  })
}
