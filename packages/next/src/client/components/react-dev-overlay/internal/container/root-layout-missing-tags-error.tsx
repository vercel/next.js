import * as React from 'react'
import { Dialog, DialogContent, DialogHeader } from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { VersionStalenessInfo } from '../components/VersionStalenessInfo'
import { HotlinkedText } from '../components/hot-linked-text'
import type { VersionInfoPayload } from '../../../../../server/dev/get-version-info-payload'

type RootLayoutMissingTagsErrorProps = {
  missingTags: string[]
  versionInfoPayload: VersionInfoPayload
}

export const RootLayoutMissingTagsError: React.FC<RootLayoutMissingTagsErrorProps> =
  function RootLayoutMissingTagsError({ missingTags, versionInfoPayload }) {
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
              <VersionStalenessInfo versionInfoPayload={versionInfoPayload} />
              <h3 id="nextjs__container_errors_label">
                Missing required html tags
              </h3>
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
