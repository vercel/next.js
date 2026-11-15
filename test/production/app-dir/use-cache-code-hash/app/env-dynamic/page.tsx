import { logic } from './logic'

export default async function Page() {
  const value = await logic()
  return <p>{value}</p>
}
