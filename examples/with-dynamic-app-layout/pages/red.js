import React from 'react'
import Link from 'next/link'

import RedLayout from '../layouts/RedLayout'

const RedPage = () => {
  return <p>
    This is the <strong style={{ color: 'red' }} >Red</strong> page, it's borders are red<br /><br />
    Go back to the <Link href='/'><a>Blue Page</a></Link>
  </p>
}

RedPage.Layout = RedLayout

export default RedPage
