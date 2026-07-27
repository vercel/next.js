import Image from 'next/image'

import src from './images/test.png'

const Page = () => {
  return (
    <main>
      <Image alt="q-undefined" id="q-undefined" src={src} />
      <Image alt="q-42" id="q-42" quality={42} src={src} />
      <Image alt="q-69" id="q-69" quality={69} src={src} />
      <Image alt="q-88" id="q-88" quality={88} src={src} />
    </main>
  )
}

export default Page
