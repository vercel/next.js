'use client'
import testImage from '../../../public/test.jpg'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <p>hello app edge</p>
      <Image src={testImage} alt="test" />
      <p id="deploymentId">{process.env.NEXT_DEPLOYMENT_ID}</p>

      <button
        onClick={() => {
          import('../../../data').then((mod) => {
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

export const runtime = 'edge'
export const preferredRegion = 'iad1'
