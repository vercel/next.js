import React from 'react'

const ForeverPage = () => <p>This page was rendered for a while!</p>

ForeverPage.getInitialProps = async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 3000)
  })
  return {}
}

export default ForeverPage
