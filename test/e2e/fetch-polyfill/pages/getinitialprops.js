export default function SSRPageWithGetInitialProps({ data }) {
  return <div>{data.foo}</div>
}

SSRPageWithGetInitialProps.getInitialProps = async () => {
  const port = process.env.NEXT_PUBLIC_API_PORT
  const res = await fetch(`http://localhost:${port}/`)
  const json = await res.json()
  return {
    data: json,
  }
}
