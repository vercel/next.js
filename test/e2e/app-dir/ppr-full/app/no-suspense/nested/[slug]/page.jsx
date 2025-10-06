import React from 'react'
import { Dynamic } from '../../../../components/dynamic'

export default async (props) => {
  const params = await props.params

  const { slug } = params

  return <Dynamic pathname={`/no-suspense/nested/${slug}`} />
}

export const generateStaticParams = async () => {
  return [{ slug: 'a' }]
}
