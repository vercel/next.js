import { connection } from 'next/server'
import { getGeneratorValue } from '../../generator-value'

export default async function Page() {
  await connection()
  return <p id="page-api-data">{await getGeneratorValue('page-api')}</p>
}
