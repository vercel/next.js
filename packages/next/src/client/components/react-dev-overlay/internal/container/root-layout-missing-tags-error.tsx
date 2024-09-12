import * as React from 'react'
import type { VersionInfo } from '../../../../../server/dev/parse-version-info'
import { Dialog, DialogContent, DialogHeader } from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { VersionStalenessInfo } from '../components/VersionStalenessInfo'
import { HotlinkedText } from '../components/hot-linked-text'

type RootLayoutMissingTagsErrorProps = {
  missingTags: string[]
  versionInfo?: VersionInfo
}

export const RootLayoutMissingTagsError: React.FC<RootLayoutMissingTagsErrorProps> =
  function RootLayoutMissingTagsError({ missingTags, versionInfo }) {
    const noop = React.useCallback(() => {}, [])
    return (
      <Overlay>
        <Dialog
          type="error"
          aria-labelledby="nextjs__container_errors_label"
          aria-describedby="nextjs__container_errors_desc"
          onClose={noop}
        >
          <DialogContent>
            <DialogHeader className="nextjs-container-errors-header">
              <VersionStalenessInfo versionInfo={versionInfo} />
              <h1
                id="nextjs__container_errors_label"
                className="nextjs__container_errors_label"
              >
                Missing required html tags
              </h1>
              <p
                id="nextjs__container_errors_desc"
                className="nextjs__container_errors_desc"
              >
                <HotlinkedText
                  text={`The following tags are missing in the Root Layout: ${missingTags
                    .map((tagName) => `<${tagName}>`)
                    .join(
                      ', '
                    )}.\nRead more at https://nextjs.org/docs/messages/missing-root-layout-tags`}
                />
              </p>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </Overlay>
    )
  }
