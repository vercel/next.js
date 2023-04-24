import Link from 'next/link'

export function getStaticProps({ draftMode }) {
  return {
    props: {
      random: Math.random(),
      draftMode: Boolean(draftMode).toString(),
    },
    revalidate: 100000,
  }
}

export default function Another(props) {
  return (
    <>
      <h1>Another</h1>
      <p>
        Draft Mode: <em id="draft">{props.draftMode}</em>
      </p>
      <p>
        Random: <em id="rand">{props.random}</em>
      </p>
      <Link href="/">Go home</Link>
    </>
  )
}
