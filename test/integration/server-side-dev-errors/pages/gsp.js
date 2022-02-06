export default function Page() {
  return <p>getStaticProps page</p>
}

export async function getStaticProps() {
  return {
    props: {},
  }
}
