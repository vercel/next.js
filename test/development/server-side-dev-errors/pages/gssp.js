export default function Page() {
  return <p>getServerSideProps page</p>
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}
