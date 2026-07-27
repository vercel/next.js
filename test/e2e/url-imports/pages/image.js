import Image from 'next/image'
import logo from 'https://github.com/vercel/next.js/raw/canary/test/e2e/url-imports/public/vercel.png?_=image'

export default () => (
  <div>
    <Image src={logo} placeholder="blur" id="static-image" />
  </div>
)
