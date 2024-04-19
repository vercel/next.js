import { dir } from 'sqlite3'

export default function Predefined() {
  return <div id="directory">{dir}</div>
}
