export default function Page({ method }: { method: string }) {
  return <p>method: {method}</p>
}

export async function getServerSideProps({ req }: { req: { method: string } }) {
  return {
    props: {
      method: req.method,
    },
  }
}
