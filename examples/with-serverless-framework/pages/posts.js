import React from 'react'
import { withRouter } from 'next/router'

const Posts = (props) => (
  <div>
    Page Posts {props.router.query.title}
  </div>
)

export default withRouter(Posts)
