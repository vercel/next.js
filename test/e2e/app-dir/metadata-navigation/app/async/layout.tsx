import { connection } from 'next/server'

export default async function layout({ children }) {
  await connection()
  return children
}

export async function generateMetadata() {
  return {
    keywords: 'parent',
  }
}
