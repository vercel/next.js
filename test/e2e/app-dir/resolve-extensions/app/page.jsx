import image from './image'
import Image from 'next/image'
import Component from './component'
import PlatformComponent from './PlatformComponent'

export default function Page() {
  return (
    <p>
      <Image src={image} alt="hello image 1" />
      <Component />
      <PlatformComponent />
    </p>
  )
}
