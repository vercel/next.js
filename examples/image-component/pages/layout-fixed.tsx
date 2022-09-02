import Image from 'next/image'
import mountains from '../public/mountains.jpg'

export default function FixedPage() {
  return (
    <>
      <h1>Image Component With Layout Fixed</h1>
      <Image
        alt="Mountains"
        src={mountains}
        layout="fixed"
        width={700}
        height={475}
      />
    </>
  )
}
