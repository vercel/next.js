export default function Page() {
  return <p>hello from guest app /blog/[slug]</p>
}

export function getServerSideProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}
