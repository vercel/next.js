import React from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'

const e = React.createElement

const AboutPage = () =>
  e(
    Layout,
    { title: 'About | Next.js + TypeScript Example' },
    e('h1', {}, 'About'),
    e('p', {}, 'This is the about page'),
    e('p', {}, e(Link, { href: '/' }, e('a', {}, 'Go home')))
  )

export default AboutPage
