import { connection } from 'next/server'
import Images from '../../components/images'

export default async function Page() {
  await connection()
  return <Images />
}
