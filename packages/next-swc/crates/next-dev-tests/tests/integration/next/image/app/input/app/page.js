import Image from 'next/image'
import img from '../public/triangle-black.png'
import Test from './test'

export default function Home() {
  return [
    <Image
      id="imported"
      alt="test imported image"
      src={img}
      placeholder="blur"
    />,
    <Test />,
  ]
}
