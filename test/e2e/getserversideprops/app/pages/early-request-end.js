export function getServerSideProps({ res }) {
  res.statusCode = 200
  res.end('hello from gssp')

  return {
    props: {},
  }
}

export default function Page(props) {
  return <p>early request end</p>
}
