import accepts from 'accepts'

import { getDisplayName } from '../lib/getDisplayName'

export const withLanguages = Page => {
  const WithLanguages = props => <Page {...props} />

  WithLanguages.getInitialProps = async context => {
    const languages = context.req
      ? accepts(context.req).languages()
      : navigator.languages

    return {
      ...(Page.getInitialProps ? await Page.getInitialProps(context) : {}),
      languages
    }
  }

  WithLanguages.displayName = `WithLanguages(${getDisplayName(Page)})`

  return WithLanguages
}
