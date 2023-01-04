import * as Log from '../build/output/log'

Log.warn(
  `"next" should not be imported directly, imported in ${module.parent?.filename}\nSee more info here: https://nextjs.org/docs/messages/import-next`
)
