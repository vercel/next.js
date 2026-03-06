import Head from 'next/head'

function Error({ statusCode, hasGetInitialPropsRun, err }) {
  return (
    <>
      <Head>
        <title>Error {statusCode}</title>
      </Head>

      <div className="error-page">
        <h1>
          {statusCode
            ? `A ${statusCode} error occurred on server`
            : 'An error occurred on client'}
        </h1>
        <p>
          {statusCode === 404
            ? 'This page could not be found.'
            : 'Sorry, something went wrong.'}
        </p>
      </div>
    </>
  )
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
