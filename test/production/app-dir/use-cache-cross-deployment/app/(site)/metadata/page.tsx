import { connection } from 'next/server'
import { getGeneratorValue } from '../../generator-value'

export async function generateMetadata() {
  await connection()
  return { title: await getGeneratorValue('metadata') }
}

export async function generateViewport() {
  return { themeColor: await getGeneratorValue('viewport') }
}

export default async function Page() {
  await connection()
  return <p>Runtime metadata</p>
}
