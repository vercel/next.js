import process from './local-process'

export function readImportedProcess() {
  return process.env.NEXT_PUBLIC_MISSING_ENV_TEST
}
