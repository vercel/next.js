import React from 'react'
import Link from 'next/link'

import PureComponent from '../components/PureComponent'
import ExtendedComponent from '../components/ExtendedComponent'
import ComponentWithTrans from '../components/ComponentWithTrans'
import { withI18next } from '../lib/withI18next'

const Test = ({ t }) => (
  <div>
    <h1>{t('welcome')}</h1>
    <p>{t('common:integrates_react-i18next')}</p>
    <p>{t('sample_test')}</p>
    <div>
      <button>{t('sample_button')}</button>
    </div>
    <PureComponent t={t} />
    <ExtendedComponent />
    <ComponentWithTrans />
    <Link href='/page2'>
      <a>{t('link.gotoPage2')}</a>
    </Link>
    <br />
    <Link href='/page3'>
      <a>{t('link.gotoPage3')}</a>
    </Link>
  </div>
)

export default withI18next(['home', 'common'])(Test)
