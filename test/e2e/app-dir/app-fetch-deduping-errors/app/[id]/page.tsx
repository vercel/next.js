'use server'

import { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  try {
    // this fetch request will error
    await fetch('http://localhost:8000', {
      cache: 'force-cache',
      next: { tags: ['id'] },
    })
  } catch (err) {
    console.log(err)
  }

  return {
    title: id,
  }
}

export default async function Error({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    // this fetch request will error
    await fetch('http://localhost:8000', {
      cache: 'force-cache',
      next: { tags: ['id'] },
    })
  } catch (err) {
    console.log(err)
  }

  return <div>Hello World {id}</div>
}
