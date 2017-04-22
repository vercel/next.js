import * as React from 'react'
import RegionParagraph from '../components/RegionParagraph'
import Head from 'next/head'
//If your editor supports it you can go to definition on indexState
export default class extends React.Component<{}, indexState> {
  constructor() {
    super();
    this.state = {
      //try adding to this array - you will get autocomplete 
      //and warning if you miss a property
      regionData: [
        { name: 'UK', visitInfo: 98 },
        { name: 'China', visitInfo: new Date(2012, 5, 5) }
      ]
    }
  }
  render() {
    return <div>
      <Head>
        <title>Yo!</title>
      </Head>
      <h1>Hello world</h1>
      {this.state.regionData.map(rD =>
        // if you don't have a data property you will get a warning
        <RegionParagraph
          key={rD.name}
          data={rD} />)
      }
    </div >
  }
}