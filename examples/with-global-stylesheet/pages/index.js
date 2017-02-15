import React from 'react'

import stylesheet from './style.scss'
// or, if you work with plain css
// import stylesheet from './style.css'

export default () =>
  <div>
    <style dangerouslySetInnerHTML={{ __html: stylesheet }} />
    <p>ciao</p>
  </div>
