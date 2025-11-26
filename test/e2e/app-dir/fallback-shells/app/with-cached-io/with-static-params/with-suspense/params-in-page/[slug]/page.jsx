'use cache'

import { LastModified } from '../../../../last-modified'

export default async function Page({ params }) {
  return <LastModified params={params} />
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
