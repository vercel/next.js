import accepts from 'accepts'

import { getDisplayName } from '../lib/getDisplayName'

export const withLanguages = Page => {
  const WithLanguages = props => <Page {...props} />

  WithLanguages.getInitialProps = context => {
    const initialProps = Page.getInitialProps
      ? Page.getInitialProps(context)
      : {}

    const languages = process.browser
      ? navigator.languages
      : accepts(context.req).languages()

    return {
      ...initialProps,
      languages
    }
  }

  WithLanguages.displayName = `WithLanguages(${getDisplayName(Page)})`

  return WithLanguages
}
