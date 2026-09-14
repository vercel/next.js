export default function Page() {
  return <p>getServerSideProps page</p>
}

export async function getServerSideProps() {
  setTimeout(() => {
    throw new Error()
  }, 10)
  return {
    props: {},
  }
}
