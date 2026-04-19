'use client'

import { redirectAction } from '../actions'

export default function Page() {
  return (
    <div>
      <form>
        <button
          id="redirect-relative"
          formAction={() => redirectAction('/redirect-target')}
        >
          redirect relative
        </button>
      </form>
      <form>
        <button
          id="redirect-external"
          formAction={() =>
            redirectAction(
              'https://next-data-api-endpoint.vercel.app/api/random?page'
            )
          }
        >
          redirect external
        </button>
      </form>
      <form>
        <button
          id="redirect-absolute"
          formAction={() =>
            redirectAction(location.origin + '/redirect-target')
          }
        >
          redirect internal with domain
        </button>
      </form>
    </div>
  )
}
