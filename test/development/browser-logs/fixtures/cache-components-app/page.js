'use cache'

import { Display } from './client'

export default async function Page() {
  const item = { id: '1', name: 'Apple', tags: ['fruit'] }
  return <Display item={item} items={[item]} />
}
