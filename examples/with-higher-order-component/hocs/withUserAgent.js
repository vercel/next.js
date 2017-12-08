import { getDisplayName } from '../lib/getDisplayName'

export const withUserAgent = Page => {
  const WithUserAgent = props => <Page {...props} />

  WithUserAgent.getInitialProps = context => {
    const initialProps = Page.getInitialProps
      ? Page.getInitialProps(context)
      : {}

    const userAgent = process.browser
      ? navigator.userAgent
      : context.req.headers['user-agent']

    return {
      ...initialProps,
      userAgent
    }
  }

  WithUserAgent.displayName = `WithUserAgent(${getDisplayName(Page)})`

  return WithUserAgent
}
