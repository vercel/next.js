import React from 'react'
import Link from 'next/link'

import BlueLayout from '../layouts/BlueLayout'

const BluePage = () => {
  return <p>
    This is the <strong style={{ color: 'blue' }}>Blue</strong> page, it's borders are blue<br /><br />
    Go to the <Link href='/red'><a style={{ color: 'red' }}>Red Page</a></Link><br /><br />
    Go to the <Link href='/green'><a style={{ color: 'green' }} >Green Page</a></Link>
  </p>
}

BluePage.Layout = BlueLayout

export default BluePage
