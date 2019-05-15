import * as React from 'react'
import { NextPageContext, NextPage } from 'next'
import Layout from '../components/Layout'
import { User } from '../interfaces'
import { findData } from '../utils/sample-api'
import ListDetail from '../components/ListDetail';

type Props = {
  item?: User,
  errors?: string,
}

const InitialPropsDetail: NextPage<Props> = ({ item, errors }) => {
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

InitialPropsDetail.getInitialProps = async ({ query }: NextPageContext) => {
  try {
    const { id } = query
    const item = await findData(Array.isArray(id) ? id[0] : id);
    return { item }
  } catch (err) {
    return { errors: err.message }
  }
}

export default InitialPropsDetail
