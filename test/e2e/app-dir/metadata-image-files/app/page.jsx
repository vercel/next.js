import _img from './apple-icon.png'
import _img2 from './icon.png'
import _img3 from './opengraph-image.png'
import _img4 from './twitter-image.png'
import _img5 from './not-metadata-image.png'
import Image from 'next/image'

export default function Page() {
  return (
    <>
      <Image src={_img} placeholder="blur" />
      <Image src={_img2} placeholder="blur" />
      <Image src={_img3} placeholder="blur" />
      <Image src={_img4} placeholder="blur" />
      <Image src={_img5} placeholder="blur" />
    </>
  )
}
