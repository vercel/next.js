export default function Page() {
  return <p>hello from second app /another/[slug]</p>
}

export function getServerSideProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}
