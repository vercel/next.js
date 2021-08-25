import { GetStaticPaths, GetStaticProps } from 'next'

export const getStaticPaths: GetStaticPaths = () => {
  return {
    // `true` also works, but `false` does not, since it causes a 404
    fallback: 'blocking',
    paths: [],
  }
}

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {},
  }
}

export default function Foo() {
  return <h1>hi</h1>
}
