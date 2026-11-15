'use client'

import Link from 'next/link'
import Image from 'next/image'
import testImage from '../../public/test.jpg'
import localFont from 'next/font/local'

const font1 = localFont({
  src: '../../public/font1_roboto.woff2',
  display: 'block',
})

export default function Page() {
  return (
    <>
      <p>hello app</p>
      <p id="roboto" className={font1.className}>
        This is roboto font
      </p>
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
