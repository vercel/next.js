import Image from 'next/image'

import staticImg from './images/static-img.png'

const Page = () => {
  return (
    <main>
      <Image
        id="nested-assets"
        src="/assets/test.png"
        width="200"
        height="200"
        alt="should work"
      />
      <Image
        id="static-img"
        src={staticImg}
        width="200"
        height="200"
        alt="should work"
      />
    </main>
  )
}

export default Page
