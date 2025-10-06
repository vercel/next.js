import image from './image'
import Image from 'next/image'
import Component from './component'

export default function Page() {
  return (
    <p>
      <Image src={image} alt="hello image 1" />
      <Component />
    </p>
  )
}
