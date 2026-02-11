export const dynamic = 'force-dynamic'

import { testData } from '../testdata'
import { Table } from './table'

export default function App() {
  return <Table data={testData()} />
}
