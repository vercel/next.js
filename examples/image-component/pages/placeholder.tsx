import Image from 'next/image'
import Layout from '../components/layout'
import mountains from '../public/mountains.jpg'

export default function PlaceholderPage() {
  return (
    <Layout>
      <h1>Image Component With Placeholder Blur</h1>
      <Image
        alt="Mountains"
        src={mountains}
        placeholder="blur"
        width={700}
        height={475}
      />
    </Layout>
  )
}
