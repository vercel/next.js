import Image from 'next/image'

import src from '../images/test.png'

const Page = () => {
  return (
    <main>
      <Image alt="q-100" id="q-100" quality={100} src={src} />
    </main>
  )
}

export default Page
