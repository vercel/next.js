import { getImageProps } from 'next/image'

function loader({ src, width, quality }) {
  return `${src}?wid=${width}&qual=${quality || 35}`
}

export default function Page() {
  const { props: img1 } = getImageProps({
    id: 'img1',
    alt: 'img1',
    src: '/logo.png',
    width: '400',
    height: '400',
    priority: true,
  })
  const { props: img2 } = getImageProps({
    id: 'img2',
    alt: 'img2',
    src: '/logo.png',
    width: '200',
    height: '200',
    loader,
  })
  return (
    <div>
      <h1>Loader Config</h1>
      <img {...img1} />
      <p>Scroll down...</p>
      <div style={{ height: '100vh' }} />
      <h2>Loader Prop</h2>
      <img {...img2} />
    </div>
  )
}
