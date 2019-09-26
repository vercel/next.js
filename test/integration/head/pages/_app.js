import React from 'react'
import App from 'next/app'

class CustomApp extends App {
  static renderHead ({ head }) {
    return (
      <>
        <title>Title from _app.js</title>
        {head}
      </>
    )
  }
}

export default CustomApp
