export default function Page({ id }) {
  return <p>Dynamic page works: {id}</p>
}

export async function getServerSideProps({ params }) {
  return {
    props: {
      id: params.id,
    },
  }
}
