import { ExternalImage, ExternalLegacyImage } from 'test-external-image'
import { getImageProps } from 'next/image'

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  const { props } = getImageProps({
    id: 'props',
    src: '/test.png',
    alt: 'props',
    width: 100,
    height: 100,
    quality: 60,
  })

  return (
    <>
      <ExternalImage
        id="modern"
        src="/test.png"
        alt="modern"
        width={100}
        height={100}
        quality={60}
        loading="eager"
      />
      <ExternalLegacyImage
        id="legacy"
        src="/test.png"
        alt="legacy"
        width={100}
        height={100}
        quality={60}
        loading="eager"
      />
      <img {...props} />
    </>
  )
}
