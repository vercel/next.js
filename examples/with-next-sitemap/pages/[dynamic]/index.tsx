import React from 'react'
import { GetStaticPaths, GetStaticProps } from 'next'

const DynamicPage: React.FC = () => {
  return (
    <div>
      <h1>DynamicPage Component</h1>
    </div>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      dynamic: 'hello'
    }
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [...Array(10000)].map((_, index) => ({
      params: {
        dynamic: `page-${index}`
      }
    })),
    fallback: false
  }
}

export default DynamicPage
