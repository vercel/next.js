'use client'
import testImage from '../../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello app</p>
      <Image src={testImage} alt="test" />

      <button
        onClick={() => {
          import('../../data').then((mod) => {
            console.log('loaded data', mod)
          })
        }}
        id="dynamic-import"
      >
        click me
      </button>
    </>
  )
}
