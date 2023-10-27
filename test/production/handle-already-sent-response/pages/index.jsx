export default function Page() {
  return <p>hello world</p>
}

export async function getServerSideProps(ctx) {
  console.log('getServerSideProps')
  ctx.res.end('already sent')
  return { props: {} }
}
