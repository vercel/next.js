import Image from 'next/image'
import Logo from '../public/test.jpg'

function Home() {
  return (
    <>
      <h1>Image Optimizer Home</h1>
      <Image src={Logo} />
    </>
  )
}

export default Home
