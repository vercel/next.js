'use client'

import { redirectAction } from './action'

export default function Page() {
  return (
    <div>
      <form>
        <button
          id="redirect-relative"
          formAction={() => redirectAction('/another')}
        >
          redirect internal with relative path
        </button>
      </form>
      <form>
        <button
          id="redirect-absolute-internal"
          formAction={() => redirectAction(location.origin + '/base/another')}
        >
          redirect internal with domain (including basePath)
        </button>
      </form>
      <form>
        <button
          id="redirect-absolute-external"
          formAction={() =>
            redirectAction(location.origin + '/outsideBasePath')
          }
        >
          redirect external with domain (excluding basePath)
        </button>
      </form>
    </div>
  )
}
