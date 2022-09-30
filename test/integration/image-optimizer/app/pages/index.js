import Image from 'next/image'

import img1 from '../public/animated2.png'
import img2 from '../public/äöüščří.png'
import img3 from '../public/test.avif'
import img4 from '../public/test.jpg'
import img5 from '../public/test.webp'
import img6 from '../public/animated.gif'
import img7 from '../public/grayscale.png'
import img8 from '../public/test.bmp'
import img9 from '../public/test.png'
import img11 from '../public/animated.png'
import img12 from '../public/mountains.jpg'
import img13 from '../public/test.gif'
import img14 from '../public/test.svg'
import img15 from '../public/animated.webp'
import img17 from '../public/test.ico'

export default function Home() {
  return (
    <>
      <h1>Image Optimizer Home</h1>
      <Image src={img1} />
      <Image src={img2} />
      <Image src={img3} />
      <Image src={img4} />
      <Image src={img5} />
      <Image src={img6} />
      <Image src={img7} />
      <Image src={img8} />
      <Image src={img9} />
      <Image src={img11} />
      <Image src={img12} />
      <Image src={img13} />
      <Image src={img14} />
      <Image src={img15} />
      <Image src={img17} />
    </>
  )
}
