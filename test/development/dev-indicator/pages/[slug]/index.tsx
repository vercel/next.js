import Link from 'next/link'

export default function Page({ slug }: { slug: string }) {
  return (
    <p>
      hello world {slug} <Link href="/gssp">to /gssp</Link>
      <Link href="/">to /</Link>
    </p>
  )
}

export const getStaticPaths = async () => {
  return {
    paths: [
      {
        params: {
          slug: 'pregenerated',
        },
      },
    ],
    fallback: true,
  }
}

export const getStaticProps = async ({
  params,
}: {
  params: { slug: string }
}) => {
  return {
    props: {
      slug: params.slug,
    },
  }
}
