import Image from 'next/image'
import Layout from '../components/layout'
import mountains from '../public/mountains.jpg'

export default function Intrinsic() {
  return (
    <Layout>
      <h1>Image Component With Layout Intrinsic</h1>
      <Image
        alt="Mountains"
        src={mountains}
        layout="intrinsic"
        width={700}
        height={475}
      />
    </Layout>
  )
}
