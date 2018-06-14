import React from 'react'
import Link from 'next/link'

import PureComponent from '../components/PureComponent'
import ExtendedComponent from '../components/ExtendedComponent'
import ComponentWithTrans from '../components/ComponentWithTrans'
import { withI18next } from '../lib/withI18next'

export default withI18next(['home', 'common'])(({ t, initialI18nStore }) => (
  <div>
    <h1>{t('welcome')}</h1>
    <p>{t('common:integrates_react-i18next')}</p>
    <PureComponent t={t} />
    <ExtendedComponent />
    <ComponentWithTrans />
    <Link href='/page2'>
      <a>{t('link.gotoPage2')}</a>
    </Link>
  </div>
))
