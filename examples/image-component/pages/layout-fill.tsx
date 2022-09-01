import Image from 'next/image'
import Layout from '../components/layout'
import mountains from '../public/mountains.jpg'

export default function FillPage() {
  return (
    <Layout>
      <h1>Image Component With Layout Fill</h1>
      <div style={{ position: 'relative', width: '300px', height: '500px' }}>
        <Image
          alt="Mountains"
          src={mountains}
          layout="fill"
          objectFit="cover"
        />
      </div>
      <div style={{ position: 'relative', width: '300px', height: '500px' }}>
        <Image
          alt="Mountains"
          src={mountains}
          layout="fill"
          objectFit="contain"
        />
      </div>
      <div style={{ position: 'relative', width: '300px', height: '500px' }}>
        <Image
          alt="Mountains"
          src={mountains}
          layout="fill"
          objectFit="none"
          quality={100}
        />
      </div>
    </Layout>
  )
}
