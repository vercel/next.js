export default function PassHeaders(props) {
  return <pre id="my-headers">{JSON.stringify(props.headers)}</pre>
}

/** @type {import('next').GetServerSideProps} */
export const getServerSideProps = (ctx) => {
  return {
    props: {
      headers: { ...ctx.req.headers },
    },
  }
}
