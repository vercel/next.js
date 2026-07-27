import { GetServerSidePropsContext } from 'next'

function Error({ statusCode }: { statusCode: number }) {
  return <p>{statusCode ? `${statusCode} error` : '500 error'}</p>
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  const statusCode = res ? res.statusCode : 404
  return { props: { statusCode } }
}

export default Error
