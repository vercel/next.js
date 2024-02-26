export default function Page() {
  return <p>hello from guest app /another/[slug]</p>
}

export function getServerSideProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}
