import {
  ExternalImage,
  ExternalLegacyImage,
  initialProps,
} from 'test-external-image'

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return (
    <>
      <p id="module-scope-props" data-srcset={initialProps.props.srcSet} />
      <ExternalImage
        id="modern"
        src="/test.png"
        alt="modern"
        width={100}
        height={100}
        loading="eager"
      />
      <ExternalLegacyImage
        id="legacy"
        src="/test.png"
        alt="legacy"
        width={100}
        height={100}
        loading="eager"
      />
    </>
  )
}
