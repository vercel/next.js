export default function Page({ method }) {
  return <p>gip page: {method}</p>
}

Page.getInitialProps = async ({ req }) => {
  return { method: req?.method ?? 'GET' }
}
