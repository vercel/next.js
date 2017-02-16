import React from 'react'
import Head from 'next/head'
import {stylesheet, classNames} from './styles.css'

export default () => (
  <p className={classNames.paragraph}>
    <Head><style dangerouslySetInnerHTML={{__html: stylesheet}} /></Head>
    bazinga
  </p>
)
