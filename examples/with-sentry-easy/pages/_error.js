import React from 'react'
import Error from 'next/error'
import * as Sentry from '@sentry/node'

const MyError = ({ statusCode, err }) => {
  if (err) {
    // This will work on both client and server sides in production.
    Sentry.captureException(err)
  }

  return <Error statusCode={statusCode} />
}

export default MyError
