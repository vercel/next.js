import React from 'react'
import SampleComponent from '../components/SampleComponent'

const Other = ({ title, linkTo }) => {
  return <SampleComponent title={title} linkTo={linkTo} />
}

export async function getStaticProps() {
  return {
    props: {
      title: 'Other Page',
      linkTo: '/',
    },
  }
}

export default Other
