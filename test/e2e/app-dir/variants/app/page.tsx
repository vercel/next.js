import { theme } from '../variants'

export default async function Page() {
  return <p id="theme">{await theme()}</p>
}
