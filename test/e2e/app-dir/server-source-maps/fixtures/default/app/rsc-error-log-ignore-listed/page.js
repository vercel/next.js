import { connection } from 'next/server'
import { run as runInternal } from 'internal-pkg'
import { run as runInternalSourceMapped } from 'internal-pkg/sourcemapped'
import { run as runExternal } from 'external-pkg'
import { run as runExternalSourceMapped } from 'external-pkg/sourcemapped'

function logError() {
  const error = new Error('Boom')
  console.error(error)
}

export default async function Page() {
  await connection()

  runInternal(function runWithInternal() {
    runInternalSourceMapped(function runWithInternalSourceMapped() {
      runExternal(function runWithExternal() {
        runExternalSourceMapped(function runWithExternalSourceMapped() {
          logError()
        })
      })
    })
  })
  return null
}
