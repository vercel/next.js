import joinCwd from './join-cwd'

export default function Page() {
  joinCwd('index.test.ts')
  return <h1>My Page</h1>
}
