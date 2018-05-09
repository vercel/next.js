import { translate, loadNamespaces } from 'react-i18next'
import { getInitialProps, I18n } from '../i18n'

export const withI18next = (namespaces = ['common']) => ComposedComponent => {
  const Extended = translate(namespaces, { i18n: I18n, wait: process.browser })(
    ComposedComponent
  )

  Extended.getInitialProps = async (ctx) => {
    const composedInitialProps = ComposedComponent.getInitialProps
      ? await ComposedComponent.getInitialProps(ctx)
      : {}

    const i18nInitialProps = ctx.req 
      ? getInitialProps(ctx.req, namespaces)
      : await loadNamespaces({
          components: [{ props: { namespaces } }],
          i18n: I18n,
        });

    return {
      ...composedInitialProps,
      ...i18nInitialProps
    }
  }

  return Extended
}
