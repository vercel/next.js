import Carousel from 'react-multi-carousel'
import { ResponsiveType } from 'react-multi-carousel/lib/types'
import 'react-multi-carousel/lib/styles.css'
import Image from 'next/image'

const BreakpointSlides: ResponsiveType = {
  desktop: {
    breakpoint: { max: 3000, min: 1024 },
    items: 3,
  },
  tablet: {
    breakpoint: { max: 1024, min: 530 },
    items: 2,
  },
  mobile: {
    breakpoint: { max: 530, min: 0 },
    items: 1,
  },
}

export default function Page() {
  return (
    <Carousel
      responsive={BreakpointSlides}
      ssr
      infinite
      itemClass="carousel-item"
      autoPlay
    >
      <Image
        alt="Gundam"
        src="/brucetang.jpg"
        priority
        layout="responsive"
        width={700}
        height={475}
      />
      <Image
        alt="Musgo"
        src="/cameronsmith.jpg"
        priority
        layout="responsive"
        width={700}
        height={475}
      />
      <Image
        alt="Valley"
        src="/ganapathykumar.jpg"
        priority
        layout="responsive"
        width={700}
        height={475}
      />
      <Image
        alt="Beach"
        src="/roanlavery.jpg"
        layout="responsive"
        width={700}
        height={475}
      />
      <Image
        alt="Torii"
        src="/tianshuliu.jpg"
        layout="responsive"
        width={700}
        height={475}
      />
    </Carousel>
  )
}
