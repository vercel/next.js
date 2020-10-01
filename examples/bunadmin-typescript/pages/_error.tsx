import React from "react"
import Error from "../components/Error"
import { ErrorGetProps } from "../components/Error/types"

function ErrorPage({ statusCode }: { statusCode: number }) {
  return <Error statusCode={statusCode} hasLayout={true} />
}

Error.getInitialProps = ({ res, err }: ErrorGetProps) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default ErrorPage
