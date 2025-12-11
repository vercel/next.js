export default function Page({ slug }: { slug: string }) {
  return <p>hello world {slug}</p>
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
