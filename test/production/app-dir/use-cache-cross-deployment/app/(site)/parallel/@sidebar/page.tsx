import { connection } from 'next/server'
import { getGeneratorValue } from '../../../generator-value'

export default async function Page() {
  await connection()
  return <p id="parallel-data">{await getGeneratorValue('parallel')}</p>
}
