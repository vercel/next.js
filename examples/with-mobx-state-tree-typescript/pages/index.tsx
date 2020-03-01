import React from 'react'
import { SampleComponent } from '../components/SampleComponent'

class IndexPage extends React.Component {
  public render() {
    return <SampleComponent title={'Index Page'} linkTo="/other" />
  }
}

export default IndexPage
