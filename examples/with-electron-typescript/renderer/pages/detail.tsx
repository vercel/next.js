// import { NextPageContext } from 'next'
import Layout from '../components/Layout'
import { User } from '../interfaces'
import { findData } from '../utils/sample-api'
import ListDetail from '../components/ListDetail'
import { GetServerSideProps } from 'next'

type Props = {
  item?: User
  errors?: string
}

const InitialPropsDetail = ({ item, errors }: Props) => {
  if (errors) {
    return (
      <Layout title={`Error | Next.js + TypeScript + Electron Example`}>
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

export const getServerSideProps: GetServerSideProps = async (context) => {
  const {
    query: { id },
  } = context

  try {
    const item = await findData(Array.isArray(id) ? id[0] : id)
    return {
      props: {
        item,
      },
    }
  } catch (err) {
    return {
      props: {
        errors: err.message,
      },
    }
  }
}

export default InitialPropsDetail
