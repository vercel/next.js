import * as features from '../../lib/features'
import Client from './client'

export default function Page() {
  return (
    <>
      <p>
        {Object.values(features)
          .map((fn) => fn(0))
          .join('|')}
      </p>
      <Client />
    </>
  )
}
