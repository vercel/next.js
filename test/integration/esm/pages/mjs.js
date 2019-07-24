import React from 'react'
import b, { a } from '../seeya'

function A ({ text }) {
  return <p>{text}</p>
}

A.getInitialProps = function () {
  return { text: b + a }
}

export default A
