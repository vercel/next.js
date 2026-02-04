export default function Page() {
  return <p>hello from host app /blog/[slug]</p>
}

export function getServerSideProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}
