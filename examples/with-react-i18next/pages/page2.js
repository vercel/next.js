import React from 'react'
import Link from 'next/link'

import PureComponent from '../components/PureComponent'
import ExtendedComponent from '../components/ExtendedComponent'
import ComponentWithTrans from '../components/ComponentWithTrans'
import { withI18next } from '../lib/withI18next'

export default withI18next(['page2', 'common'])(({ t, initialI18nStore }) => (
  <div>
    <h1>{t('welcomePage2')}</h1>
    <p>{t('common:integrates_react-i18next')}</p>
    <PureComponent t={t} />
    <ExtendedComponent />
    <ComponentWithTrans />
    <Link href='/'>
      <a>{t('link.gotoPage1')}</a>
    </Link>
  </div>
))
