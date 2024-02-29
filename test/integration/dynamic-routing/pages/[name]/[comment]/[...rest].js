// this checks priority issues with catch-all routes that
// can match `_next/data/build-id/path.json

export function getServerSideProps({ req }) {
  if (req.url.startsWith('/_next/static')) {
    return {
      props: {
        now: Date.now(),
      },
    }
  }

  return {
    notFound: true,
  }
}

export default function Page() {
  return <p>nested catch-all</p>
}
