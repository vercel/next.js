const React = require('react')
const { default: b, a } = require('../seeya')

function A ({ text }) {
  return <p>{text}</p>
}

A.getInitialProps = function () {
  return { text: b + a }
}

module.exports = A
