import * as React from 'react'
import { NextPageContext } from 'next'
import Link from 'next/link';

import Layout from '../components/Layout'
import List from '../components/List'
import IDataObject from '../interfaces'
import { findAll } from '../utils/sample-api';

type Props = {
  items: IDataObject[],
  pathname: string,
}

class ListClass extends React.Component<Props> {
  static async getInitialProps({ pathname }: NextPageContext) {
    // Example for including initial props in a Next.js page.
    // Don't forget to include the respective types for any
    // props passed into the component
    const items: IDataObject[] = await findAll()

    return { items, pathname }
  }

  render() {
    const { items, pathname } = this.props
    return (
      <Layout title="List Example | Next.js + TypeScript Example">
        <h1>List Example</h1>
        <p>You are currently on: {pathname}</p>
        <List items={items} />
        <p><Link href='/'><a>Go home</a></Link></p>
      </Layout>
    )
  }
}

export default ListClass
