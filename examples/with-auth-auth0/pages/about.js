import React from 'react'

import defaultPage from '../hocs/defaultPage'

const About = () => (
  <div>
    <h1>Nothing to see here.</h1>
    <p>
      This is just a random page.
    </p>
    <style jsx>{`
      h1 {
        font-size: 40px;
        font-weight: 200;
        line-height: 40px;
      }

      p {
        font-size: 20px;
        font-weight: 200;
        line-height: 30px;
      }
    `}</style>
  </div>
)

export default defaultPage(About)
