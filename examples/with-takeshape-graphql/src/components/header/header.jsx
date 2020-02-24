import React, { Component } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import theme from './header.module.css'

export default class Header extends Component {
  render() {
    return (
      <header className={theme.pageHeader}>
        <Head>
          <title key="title">Shape Blog</title>
          <meta
            key="description"
            name="description"
            content="A sample blog made with TakeShape"
          />
          <link
            href="https://fonts.googleapis.com/css?family=Work+Sans:400,500,600&display=swap"
            rel="stylesheet"
          />
          <link rel="icon" type="image/x-icon" href="/static/favicon.ico" />
        </Head>
        <nav>
          <Link href="/">
            <a>
              <img src={'/static/logo.svg'} alt={'Shape Blog'} />
            </a>
          </Link>
        </nav>
      </header>
    )
  }
}
