export default function Page() {
  return <p>hello world</p>
}

Page.getInitialProps = () => {
  throw new Error('custom error')
}
