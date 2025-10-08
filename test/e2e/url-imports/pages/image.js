import Image from 'next/image'
import logo from 'https://github.com/vercel/next.js/raw/canary/test/integration/url/public/vercel.png?_=image'

export default () => (
  <div>
    <Image src={logo} placeholder="blur" id="static-image" />
  </div>
)
