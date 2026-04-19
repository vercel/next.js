export default function Page() {
  return (
    <>
      <p>page: /[first]/[second]/[third]</p>
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
        params: { first: 'first', second: 'second', third: 'third' },
      },
    ],
    fallback: false,
  }
}
