import React from 'react'
import { GetStaticProps } from 'next'

interface NotFoundProps {
  message: string
}

const NotFound = ({ message }: NotFoundProps) => (
  <div>
    <h1>PAGES ROUTER - 404 PAGE</h1>
    <p>This page is using the PAGES ROUTER</p>
    <p>{message}</p>
  </div>
)

export const getStaticProps: GetStaticProps<NotFoundProps> = async () => {
  return {
    props: {
      message: 'Custom message fetched at build time',
    },
  }
}

export default NotFound
