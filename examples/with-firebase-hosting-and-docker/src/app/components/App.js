import React from 'react'
import PropTypes from 'prop-types'
import Header from './Header'

const propTypes = {
  children: PropTypes.element
}

const App = ({ children }) => (
  <main>
    <Header />
    {children}
  </main>
)

App.propTypes = propTypes

export default App
