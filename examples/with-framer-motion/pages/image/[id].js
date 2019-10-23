import * as React from 'react'
import SingleImage from '../../components/SingleImage'

const Page = ({ id }) => {
  return <SingleImage id={id} />
}

Page.getInitialProps = ({ query }) => {
  const id = Number.parseInt(query.id, 10)
  return {
    id
  }
}

export default Page
