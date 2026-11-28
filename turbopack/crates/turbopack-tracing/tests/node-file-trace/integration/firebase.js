const assert = require('assert')
const firebase = require('firebase/app')
require('firebase/firestore')
require('firebase/database')

const app = firebase.initializeApp({ projectId: 'noop' })
const store = firebase.firestore()

async function main() {
  try {
    // Load Firestore's gRPC/protobuf files for tracing without depending on
    // network access or backend availability.
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
