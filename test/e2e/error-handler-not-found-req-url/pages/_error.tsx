import type { NextPageContext } from 'next'

Error.getInitialProps = (ctx: NextPageContext) => {
  return {
    reqUrl: ctx.req?.url,
    asPath: ctx.asPath,
  }
}

export default function Error({
  reqUrl,
  asPath,
}: {
  reqUrl?: string
  asPath?: string
}) {
  return (
    <p>
      reqUrl: {reqUrl}, asPath: {asPath}
    </p>
  )
}
