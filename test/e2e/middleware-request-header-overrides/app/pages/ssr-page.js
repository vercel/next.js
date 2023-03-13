export default function SSRPage({ headers }) {
  return (
    <>
      <p id="headers">{JSON.stringify(headers)}</p>
    </>
  )
}

export const getServerSideProps = (ctx) => {
  return {
    props: {
      headers: ctx.req.headers,
    },
  }
}
