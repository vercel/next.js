import MyCoolImage from 'my-cool-image'

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return (
    <MyCoolImage
      id="ssr-image-from-node-modules"
      width={640}
      height={427}
      src="https://i.imgur.com/CgezKMb.jpg"
    />
  )
}
