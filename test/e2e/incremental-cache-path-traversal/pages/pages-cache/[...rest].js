export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  return {
    props: {
      rest: params?.rest ?? [],
    },
    revalidate: 3600,
  }
}

export default function PagesCachePage({ rest }) {
  return <main id="pages-rest">{rest.join('/')}</main>
}
