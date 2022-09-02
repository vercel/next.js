import Image from 'next/image'
import mountains from '../public/mountains.jpg'

export default function PlaceholderPage() {
  return (
    <>
      <h1>Image Component With Placeholder Blur</h1>
      <Image
        alt="Mountains"
        src={mountains}
        placeholder="blur"
        width={700}
        height={475}
      />
    </>
  )
}
