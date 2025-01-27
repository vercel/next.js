import type { VersionInfo } from '../../../../../../server/dev/parse-version-info'
import { useCallback } from 'react'
import { HotlinkedText } from '../components/hot-linked-text'
import { ErrorOverlayLayout } from '../components/errors/error-overlay-layout/error-overlay-layout'

type RootLayoutMissingTagsErrorProps = {
  missingTags: string[]
  isTurbopack: boolean
  versionInfo?: VersionInfo
}

export function RootLayoutMissingTagsError({
  missingTags,
  isTurbopack,
  versionInfo,
}: RootLayoutMissingTagsErrorProps) {
  const noop = useCallback(() => {}, [])
  return (
    <ErrorOverlayLayout
      errorType="Missing Required HTML Tag"
      errorMessage={
        <HotlinkedText
          text={`The following tags are missing in the Root Layout: ${missingTags
            .map((tagName) => `<${tagName}>`)
            .join(
              ', '
            )}.\nRead more at https://nextjs.org/docs/messages/missing-root-layout-tags`}
        />
      }
      onClose={noop}
      versionInfo={versionInfo}
      isTurbopack={isTurbopack}
    />
  )
}
