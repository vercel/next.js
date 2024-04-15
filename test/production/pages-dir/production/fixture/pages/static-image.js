import Image from 'next/image'
import logo from '../public/vercel.png'

export default () => (
  <div>
    <p>Static Image</p>
    <Image src={logo} placeholder="blur" id="static-image" />
  </div>
)
