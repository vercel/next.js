import React from 'react'
import Link from 'next/link'
import { translate } from 'react-i18next'
import i18n from '../i18n'

import PureComponent from '../components/PureComponent'
import ExtendedComponent from '../components/ExtendedComponent'

function Home ({ t, initialI18nStore }) {
  return (
    <div>
      {t('welcome')}
      <p>{t('common:integrates_react-i18next')}</p>
      <PureComponent t={t} />
      <ExtendedComponent />
      <Link href='/page2'><a>{t('link.gotoPage2')}</a></Link>
    </div>
  )
}

const Extended = translate(['home', 'common'], { i18n, wait: process.browser })(Home)

// Passing down initial translations
// use req.i18n instance on serverside to avoid overlapping requests set the language wrong
Extended.getInitialProps = async ({ req }) => {
  if (req && !process.browser) return i18n.getInitialProps(req, ['home', 'common'])
  return {}
}

export default Extended
