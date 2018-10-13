import React from 'react'
import Link from 'next/link'

import GreenLayout from '../layouts/GreenLayout'

const GreenPage = () => {
  return <p>
    This is the <strong style={{ color: 'green' }}>Green</strong> page, it's borders are green<br /><br />
    Go back to the <Link href='/'><a style={{ color: 'blue' }}>Blue Page</a></Link>
  </p>
}

GreenPage.Layout = GreenLayout

export default GreenPage
