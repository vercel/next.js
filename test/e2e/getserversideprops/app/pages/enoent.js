export async function getServerSideProps() {
  const error = new Error('oof')
  error.code = 'ENOENT'
  throw error
}

export default () => 'hi'
