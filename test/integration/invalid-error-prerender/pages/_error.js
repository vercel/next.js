import Error from 'next/error'

export async function unstable_getStaticProps() {
  return {
    props: {
      hello: 'world',
    },
    revalidate: 10,
  }
}

export default Error
