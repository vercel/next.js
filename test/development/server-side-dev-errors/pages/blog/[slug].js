export default function Page() {
  return <p>dynamic getServerSideProps page</p>
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}
