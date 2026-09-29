import { ExternalImage } from 'test-external-image'

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return (
    <ExternalImage
      id="external-image"
      src="/test.png"
      alt="rendered by an external next/image consumer"
      width={100}
      height={200}
    />
  )
}
