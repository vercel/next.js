import * as React from 'react'
import { NextContext } from 'next'
import Layout from '../components/Layout'
import IDataObject from '../interfaces'
import { findData } from '../utils/sample-api'
import ListDetail from '../components/ListDetail';

type RequestQuery = {
  id: string,
}

type Props = {
  item?: IDataObject,
  errors?: string,
}

class ListDetailPage extends React.Component<Props> {
  static getInitialProps = async ({ query }: NextContext<RequestQuery>) => {
    try {
      const item = await findData(query.id);
      return { item }
    } catch (err) {
      return { errors: err.message }
    }
  }

  render() {
    const { item, errors } = this.props;

    if (errors) {
      return (
        <Layout title={`Error | Next.js + TypeScript Example`}>
          <p><span style={{ color: 'red' }}>Error:</span> {errors}</p>
        </Layout>
      )
    }

    return (
      <Layout title={`${item ? item.name : 'Detail'} | Next.js + TypeScript Example`}>
        {item && <ListDetail item={item} />}
      </Layout>
    )
  }
}

export default ListDetailPage
