import testImage from '../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello pages</p>
      <Image src={testImage} alt="test image" />

      <button
        onClick={() => {
          import('../data').then((mod) => {
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
