'use client'

import Link from 'next/link'
import Image from 'next/image'
import testImage from '../../public/test.jpg'

export default function Page() {
  return (
    <>
      <p>hello app</p>
      <Image src={testImage} alt="test" />
      <p id="deploymentId">{process.env.NEXT_DEPLOYMENT_ID}</p>

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
      <Link id="other-app" href="/other-app">
        other app
      </Link>
    </>
  )
}
