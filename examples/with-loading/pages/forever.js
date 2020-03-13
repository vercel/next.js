import React from 'react'

const ForeverPage = () => <p>This page was rendered for a while!</p>

export async function getStaticProps() {
  await new Promise(resolve => {
    setTimeout(resolve, 3000)
  })
  return { props: {} }
}

export default ForeverPage
