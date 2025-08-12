export default function Page(props) {
  return (
    <>
      <p>/_sites/[site]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  return {
    props: {
      params,
      now: Date.now(),
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [
      {
        params: { site: 'subdomain-1' },
      },
      {
        params: { site: 'subdomain-2' },
      },
    ],
    fallback: 'blocking',
  }
}
