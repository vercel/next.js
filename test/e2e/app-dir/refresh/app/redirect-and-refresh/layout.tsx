import { getTodoEntries } from './actions'

export default async function Layout({ children }) {
  const entries = await getTodoEntries()

  console.log({ entries })
  return (
    <div>
      <div id="todo-entries">
        {entries.length > 0 ? (
          entries.map((phrase, index) => <div key={index}>{phrase}</div>)
        ) : (
          <div id="no-entries">No entries</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}
