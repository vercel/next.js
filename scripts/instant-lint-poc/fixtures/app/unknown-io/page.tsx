// Expect: BLOCKING (unclassified, assumed dynamic) — awaits a member call on
// an import the analyzer cannot resolve (a database client). Dynamic-by-
// default is the Cache Components contract, so this is reported with all
// three remedies but flagged as unclassified.
import { db } from 'fake-orm'

export default async function Page() {
  const rows = await db.query('select * from products')
  return <ul>{rows.length}</ul>
}
