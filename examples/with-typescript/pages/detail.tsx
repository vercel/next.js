import * as React from 'react'
import { GetServerSideProps } from 'next'
import Layout from '../components/Layout'
import { User } from '../interfaces'
import { findData } from '../utils/sample-api'
import ListDetail from '../components/ListDetail'

type Props = {
  item?: User
  errors?: string
}

export default function(props: Props) {
  const { item, errors } = props

  if (errors) {
    return (
      <Layout title={`Error | Next.js + TypeScript Example`}>
        <p>
          <span style={{ color: 'red' }}>Error:</span> {errors}
        </p>
      </Layout>
    )
  }

  return (
    <Layout
      title={`${item ? item.name : 'Detail'} | Next.js + TypeScript Example`}
    >
      {item && <ListDetail item={item} />}
    </Layout>
  )
}

// Fetch data on each request.
export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  try {
    const { id } = query
    const item = await findData(Array.isArray(id) ? id[0] : id)
    return { props: { item } }
  } catch (err) {
    return { props: { errors: err.message } }
  }
}
