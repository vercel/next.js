import sqlite3 from 'sqlite3'

export default function Page() {
  console.log(sqlite3.READONLY)
  return <h1 id="message">Hello World</h1>
}
