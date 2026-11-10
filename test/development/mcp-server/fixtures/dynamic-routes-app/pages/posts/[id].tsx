export default function Post({ id }: { id: string }) {
  return <div>Post {id}</div>
}

export async function getServerSideProps(context: any) {
  return {
    props: { id: context.params.id },
  }
}
