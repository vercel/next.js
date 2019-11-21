import React from 'react'

const AboutPage = () => <p>This is about Next.js!</p>

AboutPage.getInitialProps = async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 500)
  })
  return {}
}

export default AboutPage
