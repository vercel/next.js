/// <reference types="./provide-controlled-connection.d.ts" />
import { Deferred } from './deferred.js'
import { freeze } from './object-utils.js'
export async function provideControlledConnection(connectionProvider) {
  const connectionDefer = new Deferred()
  const connectionReleaseDefer = new Deferred()
  connectionProvider
    .provideConnection(async (connection) => {
      connectionDefer.resolve(connection)
      return await connectionReleaseDefer.promise
    })
    .catch((ex) => connectionDefer.reject(ex))
  // Create composite of the connection and the release method instead of
  // modifying the connection or creating a new nesting `DatabaseConnection`.
  // This way we don't accidentally override any methods of 3rd party
  // connections and don't return wrapped connections to drivers that
  // expect a certain specific connection class.
  return freeze({
    connection: await connectionDefer.promise,
    release: connectionReleaseDefer.resolve,
  })
}
