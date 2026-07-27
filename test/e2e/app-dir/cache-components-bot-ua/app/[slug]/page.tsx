import React from 'react'

import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate a delay
  return {
    title: 'Home',
    description: 'Welcome to the home page',
  }
}

export default async function Home({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Math.random() will cause SSG_BAILOUT if static generation runs
  // Bots should bypass static generation in PPR to avoid this error
  const randomValue = Math.random()

  return (
    <>
      <h1>{slug}</h1>
      <p>{randomValue}</p>
    </>
  )
}
