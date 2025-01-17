import * as classes from 'example'

function Home() {
  return <div>This should fail at build time {JSON.stringify(classes)}.</div>
}

export default Home
