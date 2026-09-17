import pkg from 'pkg'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <p id="dep">{pkg}</p>
}
