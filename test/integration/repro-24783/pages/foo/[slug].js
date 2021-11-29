export const getStaticPaths = () => {
  return {
    // `true` also works, but `false` does not, since it causes a 404
    fallback: 'blocking',
    paths: [],
  }
}

export const getStaticProps = async () => {
  return {
    props: {},
  }
}

export default function Foo() {
  return <h1>hi</h1>
}
