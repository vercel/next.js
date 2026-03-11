const firebase = require('firebase/app')
require('firebase/firestore')
require('firebase/database')

firebase.initializeApp({ projectId: 'noop' })
const store = firebase.firestore()

store
  .collection('users')
  .get()
  .then(
    () => {
      console.log('ok')
      process.exit(0)
    },
    (e) => {
      /*
      Error: unresolvable extensions: 'extend google.protobuf.MethodOptions' in .google.api
        at Root.resolveAll (/private/var/folders/c3/vytj6_h56b77f_g72smntm3m0000gn/T/node_modules/protobufjs/src/root.js:243:1)
        at Object.loadSync (/private/var/folders/c3/vytj6_h56b77f_g72smntm3m0000gn/T/a707d6b7ee4afe5b484993180e617e2d/index.js:43406:16)
        at loadProtos (/private/var/folders/c3/vytj6_h56b77f_g72smntm3m0000gn/T/a707d6b7ee4afe5b484993180e617e2d/index.js:16778:41)
        at NodePlatform.module.exports.278.NodePlatform.loadConnection (/private/var/folders/c3/vytj6_h56b77f_g72smntm3m0000gn/T/a707d6b7ee4afe5b484993180e617e2d/index.js:16815:22)
        at FirestoreClient.module.exports.278.FirestoreClient.initializeRest (/private/var/folders/c3/vytj6_h56b77f_g72smntm3m0000gn/T/a707d6b7ee4afe5b484993180e617e2d/index.js:28414:14)
        at /private/var/folders/c3/vytj6_h56b77f_g72smntm3m0000gn/T/a707d6b7ee4afe5b484993180e617e2d/index.js:28239:64
      */
      console.error(e)
      process.exit(1)
    }
  )
