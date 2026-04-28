export default function Page({ method }: { method: string }) {
  return <p>method: {method}</p>
}

Page.getInitialProps = async (ctx: { req?: { method: string } }) => {
  return { method: ctx.req?.method ?? 'GET' }
}
