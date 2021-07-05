import Image from 'next/image'
import logo from '../public/vercel.png'

const StaticImage = () => (
  <div>
    <p>Static Image</p>
    <Image src={logo} placeholder="blur" id="static-image" />
  </div>
)

export default StaticImage
