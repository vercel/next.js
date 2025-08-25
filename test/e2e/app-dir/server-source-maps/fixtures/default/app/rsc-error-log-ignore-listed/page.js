import { runInternal } from '@next-test-server-source-maps/internal-pkg'
import { runInternalSourceMapped } from '@next-test-server-source-maps/internal-pkg/sourcemapped'
import { runInternalIgnored } from '@next-test-server-source-maps/internal-pkg/ignored'
import { runExternal } from '@next-test-server-source-maps/external-pkg'
import { runExternalSourceMapped } from '@next-test-server-source-maps/external-pkg/sourcemapped'

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
