import React from 'react'
import { NextContext } from 'next'

import Layout from '../components/Layout'
import List from '../components/List'
import IDataObject from '../interfaces'

type Props = {
  items: IDataObject[],
}

class ListClass extends React.Component<Props> {
  static async getInitialProps({ pathname }: NextContext) {
    const dataArray: IDataObject[] =
      [{ id: 101, name: 'larry' }, { id: 102, name: 'sam' }, { id: 103, name: 'jill' }, { id: 104, name: pathname }]

    return { items: dataArray }
  }

  render() {
    return (
      <Layout title="About | Next.js + TypeScript Example">
        <List items={this.props.items} />
      </Layout>
    )
  }
}

export default ListClass
