import { GetServerSideProps } from 'next'
import React from 'react'

export interface ProductPageProps {
  test: string
}

const ProductPage = (params: ProductPageProps) => {
  return (
    <>
      <h1 id="text">Param found: {params.test}</h1>
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const joined = Array.isArray(params['product-params'])
    ? params['product-params'].join(', ')
    : params['product-params']
  return {
    props: {
      test: joined ? joined : 'Not Found',
    },
  }
}

export default ProductPage
