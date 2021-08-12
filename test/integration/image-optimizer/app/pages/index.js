import Image from 'next/image'
import Logo from '../public/test.jpg'

function Home() {
  return (
    <>
      <h1>Image Optimizer Home</h1>
      <Image src={Logo} />
      <Image src="/äöü.png" width={200} height={200} />
      <Image
        src="https://image-optimization-test.vercel.app/äöü.png"
        width={200}
        height={200}
      />
    </>
  )
}

export default Home
