import { useTestHarness } from '@turbo/pack-test-harness'
import MagicImage from 'magic-image'

export default function Home() {
  useTestHarness(runTests)

  return <MagicImage />
}

function runTests() {
  it('it should link to imported image from a package', function () {
    const img = document.querySelector('#magic')
    expect(img.src).toContain(encodeURIComponent('_next/static/media'))
  })
}
