import { getDisplayName } from '../lib/getDisplayName'

export const withUserAgent = Page => {
  const WithUserAgent = props => <Page {...props} />

  WithUserAgent.getInitialProps = async context => {
    const initialProps = Page.getInitialProps
      ? await Page.getInitialProps(context)
      : {}

    const userAgent = context.req
      ? context.req.headers['user-agent']
      : navigator.userAgent

    return {
      ...initialProps,
      userAgent
    }
  }

  WithUserAgent.displayName = `WithUserAgent(${getDisplayName(Page)})`

  return WithUserAgent
}
