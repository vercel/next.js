import { inc, get } from './action'

export async function Server() {
  const x = await get()
  return (
    <>
      <h2 id="value">Value = {x}</h2>
      <form>
        <button id="server-inc" formAction={inc}>
          Inc
        </button>
      </form>
    </>
  )
}
