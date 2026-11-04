const assert = require('assert')
const firebase = require('firebase/app')
require('firebase/firestore')
require('firebase/database')

const app = firebase.initializeApp({ projectId: 'noop' })
const store = firebase.firestore()

async function main() {
  try {
    // Still load Firestore's gRPC/protobuf files for tracing, but never contact
    // the backend: its connection errors can differ between the two executions.
    await store.disableNetwork()
    const snapshot = await store.collection('users').get()
    assert.strictEqual(snapshot.empty, true)
    assert.strictEqual(snapshot.metadata.fromCache, true)
  } finally {
    await app.delete()
  }
  console.log('ok')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
