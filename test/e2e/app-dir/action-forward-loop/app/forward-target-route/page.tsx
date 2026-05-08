const theAction = async () => {
  'use server'
}

export default function Page() {
  return (
    <div>
      <p id="forward-target-page">forward-target-route</p>
      <form action={theAction}>
        <button type="submit">submit</button>
      </form>
    </div>
  )
}
