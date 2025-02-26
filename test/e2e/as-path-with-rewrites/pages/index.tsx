import { GetServerSidePropsContext } from 'next'
import { useRouter } from 'next/router'
import React from 'react'

export async function getServerSideProps(context: GetServerSidePropsContext) {
  return { props: {} }
}

export default function Page() {
  const router = useRouter()

  return <h1>home: {router.asPath}</h1>
}
