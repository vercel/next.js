export async function getStaticProps() {
  if (process.env.NODE_ENV === 'development') {
    const error = new Error('oof')
    error.code = 'ENOENT'
    throw error
  }
  return {
    props: {
      hi: 'hi',
    },
  }
}

export default () => 'hi'
