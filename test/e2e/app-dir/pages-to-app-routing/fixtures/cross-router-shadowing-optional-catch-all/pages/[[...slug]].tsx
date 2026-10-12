import type { GetServerSidePropsContext } from 'next'
import Link from 'next/link'

type Props = {
  slug: string[]
}

export default function OptionalCatchall({ slug }: Props) {
  // The optional catch-all also owns `/`, so it doubles as the start page.
  if (slug.length === 0) {
    return (
      <>
        <h1 id="page-title">Pages Home</h1>
        <Link id="to-lang-link" href="/en">
          To App Lang
        </Link>
        <Link id="to-lang-about-link" href="/en/about">
          To App About
        </Link>
      </>
    )
  }

  return (
    <>
      <h1 id="page-title">Pages Optional Catchall: {slug.join('/')}</h1>
      <Link id="to-home-link" href="/">
        To Home
      </Link>
    </>
  )
}

export async function getServerSideProps({
  params,
}: GetServerSidePropsContext) {
  return {
    props: {
      slug: (params?.slug as string[]) ?? [],
    },
  }
}
