import { getImageProps } from 'next/image'

export default function Page() {
  const { props: imageProps } = getImageProps({
    id: 'logo',
    alt: 'logo',
    src: '/logo.png',
    width: '400',
    height: '400',
  })

  return (
    <div>
      <img {...imageProps} />
    </div>
  )
}
