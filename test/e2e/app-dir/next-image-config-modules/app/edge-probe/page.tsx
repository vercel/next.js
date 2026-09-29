import Image, { getImageProps } from 'next/image'
import LegacyImage from 'next/legacy/image'

export const runtime = 'edge'

const publicProps = getImageProps({
  src: '/assets/test.png',
  alt: 'public',
  fill: true,
})

export default function Page() {
  return (
    <>
      <p id="edge-public" data-srcset={publicProps.props.srcSet} />
      <Image
        id="edge-modern"
        src="/assets/test.png"
        alt="modern"
        fill
        loading="eager"
      />
      <LegacyImage
        id="edge-legacy"
        src="/assets/test.png"
        alt="legacy"
        layout="fill"
        loading="eager"
      />
    </>
  )
}
