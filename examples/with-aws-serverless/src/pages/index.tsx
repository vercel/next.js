import React from 'react'
import Head from 'next/head'

export default () => {
  const title: string = 'Home'

  return (
    <>
      <Head>
        <title>nextjs-with-aws-serveress : {title}</title>
      </Head>
      <div>
        <h1>{title}</h1>
        <img src="/images/bg1.png" alt={'example image'} width={500} />
      </div>
    </>
  )
}
