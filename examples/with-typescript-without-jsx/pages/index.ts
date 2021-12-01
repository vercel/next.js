import React from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'

const e = React.createElement

const IndexPage = () =>
  e(
    Layout,
    { title: 'Home | Next.js + TypeScript Example' },
    e('h1', {}, 'Hello Next.js 👋'),
    e('p', {}, e(Link, { href: '/about' }, e('a', {}, 'About')))
  )

export default IndexPage
