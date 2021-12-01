import React from 'react'
import { GetStaticProps } from 'next'
import Link from 'next/link'

import { User } from '../../interfaces'
import { sampleUserData } from '../../utils/sample-data'
import Layout from '../../components/Layout'
import List from '../../components/List'

const e = React.createElement

type Props = {
  items: User[]
}

const WithStaticProps = ({ items }: Props) =>
  e(
    Layout,
    { title: 'Users List | Next.js + TypeScript Example' },
    e('h1', {}, 'Users List'),
    e(
      'p',
      {},
      'Example fetching data from inside ',
      e('code', {}, 'getStaticProps()')
    ),
    e('p', {}, 'You are currently on: /users'),
    e(List, { items: items }),
    e('p', {}, e(Link, { href: '/' }, e('a', {}, 'Go home')))
  )

export const getStaticProps: GetStaticProps = async () => {
  // Example for including static props in a Next.js function component page.
  // Don't forget to include the respective types for any props passed into
  // the component.
  const items: User[] = sampleUserData
  return { props: { items } }
}

export default WithStaticProps
