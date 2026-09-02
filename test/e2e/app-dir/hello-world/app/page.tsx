export default function Page() {
  // Temporary CI experiment: trigger a Node deprecation at request time to
  // verify --trace-deprecation propagates to the server process.
  require('sys')
  return <p>hello world</p>
}
