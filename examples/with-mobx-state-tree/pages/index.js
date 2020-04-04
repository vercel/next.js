import React from 'react'
import SampleComponent from '../components/SampleComponent'

const Index = ({ title, linkTo }) => {
  return <SampleComponent title={title} linkTo={linkTo} />
}

export async function getStaticProps() {
  return {
    props: {
      title: 'Index Page',
      linkTo: '/other',
    },
  }
}

export default Index
