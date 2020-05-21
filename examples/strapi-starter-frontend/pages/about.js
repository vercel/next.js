import React from 'react'
import Layout from '../components/layout'
import { getCategories } from '../lib/api'

const About = ({ categories }) => {
  return (
    <Layout categories={categories}>
      <div className="uk-section">
        <div className="uk-container uk-container-large">
          <h1>About</h1>
          <p>
            This is a <a href="https://nextjs.org/">Next.js</a> and{' '}
            <a href="https://strapi.io/">Strapi</a> powered blog.
          </p>
        </div>
      </div>
    </Layout>
  )
}

export async function getStaticProps() {
  const categories = (await getCategories()) || []
  return {
    props: { categories },
    unstable_revalidate: 1,
  }
}

export default About
