import React from 'react'

const AboutPage = () => <p>This is about Next.js!</p>

export async function getStaticProps() {
  await new Promise(resolve => {
    setTimeout(resolve, 500)
  })
  return { props: {} }
}

export default AboutPage
