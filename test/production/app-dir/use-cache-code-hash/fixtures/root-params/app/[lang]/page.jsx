import { readLanguage } from './read-language'

export default async function Page() {
  return <p>{await readLanguage()}</p>
}
