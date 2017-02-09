import React, { PropTypes } from 'react'

import securePage from '../hocs/securePage'

const Secret = ({ loggedUser }) => (
  <div>
    <p>
      Hi {loggedUser.email}. This is a super secure page! Try loading this page again using the incognito/private mode of your browser.
    </p>
    <style jsx>{`
      p {
        font-size: 20px;
        font-weight: 200;
        line-height: 30px;
      }
    `}</style>
  </div>
)

Secret.propTypes = {
  loggedUser: PropTypes.object.isRequired
}

export default securePage(Secret)
