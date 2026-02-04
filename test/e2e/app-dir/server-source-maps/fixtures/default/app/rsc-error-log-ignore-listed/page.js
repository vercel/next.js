import { runInternal } from 'internal-pkg'
import { runInternalSourceMapped } from 'internal-pkg/sourcemapped'
import { runInternalIgnored } from 'internal-pkg/ignored'
import { runExternal } from 'external-pkg'
import { runExternalSourceMapped } from 'external-pkg/sourcemapped'

function logError() {
  const error = new Error('rsc-error-log-ignore-listed')
  console.error(error)
}

export default async function Page() {
  runInternal(function runWithInternal() {
    runInternalSourceMapped(function runWithInternalSourceMapped() {
      runExternal(function runWithExternal() {
        runExternalSourceMapped(function runWithExternalSourceMapped() {
          runInternalIgnored(function runWithInternalIgnored() {
            logError()
          })
        })
      })
    })
  })
  return null
}
