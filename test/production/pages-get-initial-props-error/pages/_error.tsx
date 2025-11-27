import type { NextPageContext } from 'next'

type ErrorProps = {
  statusCode?: number
}

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <p>
      {statusCode !== undefined
        ? `An error ${statusCode} occurred on server`
        : 'An error occurred on client'}
    </p>
  )
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  console.log('ErrorPage.gip:err', err, '!!res', !!res)
  let statusCode = 200
  try {
    statusCode = res?.statusCode ?? err?.statusCode ?? (res || err ? 500 : 404)
  } catch (error) {
    console.error('ErrorPage.gip:try-catch', error)
  }

  console.trace(
    'ErrorPage.status code',
    'res?.statusCode',
    res?.statusCode,
    'err?.statusCode',
    err?.statusCode,
    'final',
    statusCode
  )
  return { statusCode }
}

export default ErrorPage
