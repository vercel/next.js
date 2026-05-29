export default function Page() {
  return <p>hello world</p>
}

Page.getInitialProps = async () => {
  return {
    static: false,
  }
}
