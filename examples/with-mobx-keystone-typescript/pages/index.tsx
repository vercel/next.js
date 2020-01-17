import React from 'react'
import { NextPage } from 'next'

import { Sample } from '../components/Sample'

const IndexPage: NextPage = () => {
  return <Sample linkTo="/other" />
}

export default IndexPage
