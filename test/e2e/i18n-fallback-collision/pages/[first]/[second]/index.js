export default function Page() {
  return (
    <>
      <p>page: /[first]/[second]</p>
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
        params: { first: 'first', second: 'second' },
      },
    ],
    fallback: false,
  }
}
