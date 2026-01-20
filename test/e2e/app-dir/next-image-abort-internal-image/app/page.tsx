import Image from 'next/image'
import TestImage from '../public/test.png'

export default function Page() {
  return <Image id="app-image" src={TestImage} alt="Test Image" />
}
