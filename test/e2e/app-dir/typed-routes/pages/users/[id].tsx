export default function UserPage({ id }: { id: string }) {
  return <div>User: {id}</div>
}

export async function getServerSideProps({ query }: { query: { id: string } }) {
  return {
    props: {
      id: query.id,
    },
  }
}
