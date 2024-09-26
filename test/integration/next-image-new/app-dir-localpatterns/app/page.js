import Image from 'next/image'

import staticImg from './static-img.png'

const Page = () => {
  return (
      <main>
        <Image id="does-not-exist" src="/does-not-exist" width="400" height="400" alt="should fail" />
        <Image id="top-level" src="/test.png" width="400" height="400" alt="should fail" />
        <Image id="nested-blocked" src="/blocked/test.png" width="400" height="400" alt="should fail" />
        <Image id="nested-assets" src="/assets/test.png" width="400" height="400" alt="should work" />
        <Image id="nested-assets-query" src="/assets/test.png?v=1" width="400" height="400" alt="should fail" />
        <Image id="static-img" src={staticImg} alt="should work" />
      </main>
  )
}

export default Page
