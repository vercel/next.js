// The imported user file has the same relative path as a generated getter. The
// collector must distinguish them by filesystem identity.
import { lang } from '../../../root-params/lang'

export async function readLookalike() {
  'use cache'
  return lang()
}
