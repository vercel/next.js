export default function Page() {
  return <p>static</p>
}

export async function getStaticProps() {
  return {
    props: {},
  }
}
