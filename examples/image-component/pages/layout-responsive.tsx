import Image from 'next/image'
import Layout from '../components/layout'
import mountains from '../public/mountains.jpg'

export default function Responsive() {
  return (
    <Layout>
      <h1>Image Component With Layout Responsive</h1>
      <Image
        alt="Mountains"
        src={mountains}
        layout="responsive"
        width={700}
        height={475}
      />
    </Layout>
  )
}
