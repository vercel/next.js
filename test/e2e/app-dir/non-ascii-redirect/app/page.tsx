import { redirect } from 'next/navigation'

export default function Page() {
  return (
    <form
      action={async () => {
        'use server'
        redirect('/destination/テスト')
      }}
    >
      <button id="submit">Submit</button>
    </form>
  )
}
