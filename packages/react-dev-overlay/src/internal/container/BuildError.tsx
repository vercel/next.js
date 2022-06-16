import * as React from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { Terminal } from '../components/Terminal'
import { noop as css } from '../helpers/noop-template'

export type BuildErrorProps = { message: string }

export const BuildError: React.FC<BuildErrorProps> = function BuildError({
  message,
}) {
  const noop = React.useCallback(() => {}, [])
  return (
    <Overlay fixed>
      <Dialog
        type="error"
        aria-labelledby="nextjs__container_build_error_label"
        aria-describedby="nextjs__container_build_error_desc"
        onClose={noop}
      >
        <DialogContent>
          <DialogHeader className="nextjs-container-build-error-header">
            <h4 id="nextjs__container_build_error_label">Failed to compile</h4>
            <NextStatus />
          </DialogHeader>
          <DialogBody className="nextjs-container-build-error-body">
            <Terminal content={message} />
            <footer>
              <p id="nextjs__container_build_error_desc">
                <small>
                  This error occurred during the build process and can only be
                  dismissed by fixing the error.
                </small>
              </p>
            </footer>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Overlay>
  )
}

export const styles = css`
  .nextjs-container-build-error-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .nextjs-container-build-error-header > h4 {
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  .nextjs-container-build-error-body footer {
    margin-top: var(--size-gap);
  }
  .nextjs-container-build-error-body footer p {
    margin: 0;
  }

  .nextjs-container-build-error-body small {
    color: #757575;
  }

  .nextjs-container-build-error-version-status {
    font-weight: bold;
  }
  .nextjs-container-build-error-version-status span {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background: #eaeaea;
    margin-right: 6px;
  }

  .nextjs-container-build-error-version-status span.fresh {
    background: #50e3c2;
  }

  .nextjs-container-build-error-version-status span.outdated {
    background: #e00;
  }

  .nextjs-container-build-error-version-status span.stale {
    background: #f5a623;
  }
`
declare global {
  interface Window {
    next: { version: string; latest: string }
  }
}

type Staleness = 'fresh' | 'stale' | 'outdated'

const NextStatus = () => {
  const [staleness, setStaleness] = React.useState<Staleness>()
  React.useEffect(() => {
    ;(async () => {
      try {
        const installedVersion = window.next.version.replace(/-canary.*/, '')

        const latestVersion = await getLatest()
        console.log(latestVersion, installedVersion)

        const result = compareVersions(installedVersion, latestVersion)
        setStaleness(result)
      } catch {}
    })()
  }, [])

  const title = {
    fresh: 'Next.js is up to date!',
    stale: 'Next.js is out of date, update recommended!',
    outdated: 'Next.js is out of date, update necessary!',
    undetermined: 'Could not determine Next.js version status.',
  }[staleness ?? 'undetermined']

  return (
    <div title={title} className="nextjs-container-build-error-version-status">
      <span className={staleness} />
      Next.js {window.next.version}
    </div>
  )
}

async function getLatest() {
  return '12.1.6'
  if (window.next.latest) {
    return window.next.latest
  }

  const res = await fetch(
    'https://api.github.com/repos/vercel/next.js/releases/latest'
  )

  const latest = await res.json()
  const { tag_name } = latest
  const latestVersion = tag_name.replace(/^v/, '')
  window.next.latest = latestVersion
  return latestVersion
}

function compareVersions(a: string, b: string): Staleness {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < 3; i++) {
    const na = Number(pa[i])
    const nb = Number(pb[i])
    if (na > nb) return 'fresh'
    if (nb > na) return 'stale'
    if (!isNaN(na) && isNaN(nb)) return 'fresh'
    if (isNaN(na) && !isNaN(nb)) return 'stale'
  }
  return 'fresh'
}
