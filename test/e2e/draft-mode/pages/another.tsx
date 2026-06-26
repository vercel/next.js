import Link from 'next/link'
import type { GetStaticProps } from 'next'

type Props = {
  random: number
  draftMode: string
}

export const getStaticProps: GetStaticProps<Props> = ({ draftMode }) => {
  return {
    props: {
      random: Math.random(),
      draftMode: Boolean(draftMode).toString(),
    },
    revalidate: 100000,
  }
}

export default function Another(props: Props) {
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
