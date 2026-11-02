import * as Log from '../build/output/log'

export function warn(importer: string) {
  Log.warnOnce(
    `"next" should not be imported directly, imported in ${importer}\nSee more info here: https://nextjs.org/docs/messages/import-next`
  )
  return {}
}
