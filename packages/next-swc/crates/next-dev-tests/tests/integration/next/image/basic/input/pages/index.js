import Image from 'next/image'
import { img } from '../components/img'
import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return [
    <Image
      id="imported"
      alt="test imported image"
      src={img}
      width="100"
      height="100"
    />,
    <Image
      id="local"
      alt="test src image"
      src="/triangle-black.png"
      width="100"
      height="100"
    />,
  ]
}

function runTests() {
  it('it should link to imported image', function () {
    const img = document.querySelector('#imported')
    expect(img.src).toContain(encodeURIComponent('_next/static/assets'))
  })

  it('it should link to local src image', function () {
    const img = document.querySelector('#local')
    expect(img.src).toContain('triangle-black')
  })
}
