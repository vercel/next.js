import joinCwd from './join-cwd'
import { readBareArg, readJoinedArg } from './read-ignored'

export default function Page() {
  joinCwd('index.test.ts')
  // These use `turbopackIgnore` and must NOT produce a tracing warning.
  readBareArg('index.test.ts')
  readJoinedArg('index.test.ts')
  return <h1>My Page</h1>
}
