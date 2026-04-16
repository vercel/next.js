import { addEntryAndRefresh } from './actions'

export default function Page() {
  return (
    <>
      <form action={addEntryAndRefresh}>
        <label htmlFor="todo-input">Entry</label>
        <input
          id="todo-input"
          type="text"
          name="entry"
          placeholder="Enter a new entry"
        />
        <button id="add-button" type="submit">
          Add New Todo Entry
        </button>
      </form>
    </>
  )
}
