// @flow
import React from 'react'
import Head from 'next/head'

export default function Page({
  children,
  title = 'This is the default title',
}) {
  return (
    <section>
      <Head>
        <title>{title}</title>
      </Head>
      {children}
    </section>
  )
}
