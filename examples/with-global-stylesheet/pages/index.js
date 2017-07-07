import React from 'react'

import stylesheet from 'styles/index.scss'
// or, if you work with plain css
// import stylesheet from 'styles/index.css'

export default () =>
  <div>
    <style jsx global>{stylesheet}</style>
    <p>ciao</p>
    <p className="foo">hello</p>
  </div>
