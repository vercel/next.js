import React from 'react'
import { Dynamic } from '../../../../components/dynamic'

export default ({ params: { slug } }) => {
  return <Dynamic pathname={`/no-suspense/nested/${slug}`} />
}

export async function generateStaticParams() {
  return [{ slug: 'a' }]
}
