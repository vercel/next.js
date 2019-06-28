import React from 'react'
import Head from '../components/head'
import Nav from '../components/nav'
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/something'))

const Home = () => (
  <div>
    <Head title='Other' />
    <Nav />

    <div className='hero'>
      <h1 className='title'>Welcome to Other Next.js!</h1>
      <p className='description'>
        To get started, edit <code>pages/other.js</code> and save to reload.
      </p>
    </div>

    <DynamicComponent />

    <style jsx>{`
      .hero {
        width: 100%;
        color: #333;
      }
      .title {
        margin: 0;
        width: 100%;
        padding-top: 80px;
        line-height: 1.15;
        font-size: 48px;
      }
      .title,
      .description {
        text-align: center;
      }
    `}</style>
  </div>
)

Home.getInitialProps = () => ({})

export default Home
