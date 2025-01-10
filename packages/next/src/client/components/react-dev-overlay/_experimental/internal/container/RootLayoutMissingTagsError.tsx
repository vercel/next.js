import type { VersionInfo } from '../../../../../../server/dev/parse-version-info'
import { useCallback } from 'react'
import { HotlinkedText } from '../components/hot-linked-text'
import { ErrorOverlayLayout } from '../components/Errors/error-overlay-layout/error-overlay-layout'

type RootLayoutMissingTagsErrorProps = {
  missingTags: string[]
  versionInfo?: VersionInfo
}

export function RootLayoutMissingTagsError({
  missingTags,
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
    />
  )
}
