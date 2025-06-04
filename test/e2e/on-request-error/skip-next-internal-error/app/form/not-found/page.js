import { notFoundAction } from '../action'

export default function Page() {
  return (
    <form action={notFoundAction}>
      <input type="hidden" name="payload" value={'payload-value'} />
      <button type="submit">submit</button>
    </form>
  )
}

export const dynamic = 'force-dynamic'
