import { getList } from '../shared'

export default function Page() {
  return <p>{getList().length}</p>
}
