import type { HTMLProps } from 'react'
import type { DevToolsInfoPropsCore } from '../errors/dev-tools-indicator/dev-tools-info/dev-tools-info'

import { DevToolsInfo } from '../errors/dev-tools-indicator/dev-tools-info/dev-tools-info'
import { LeftArrow } from '../../icons/left-arrow'

export function MetadataViewer(
  props: DevToolsInfoPropsCore & HTMLProps<HTMLDivElement>
) {
  const metadata = window.__NEXT_DEVTOOLS_CLIENT_STATE?.resolvedMetadata
  console.log({ metadata })

  return (
    <DevToolsInfo
      title={
        <>
          <button
            className="segment-explorer-back-button"
            onClick={props.close}
          >
            <LeftArrow />
          </button>
          {'Metadata Viewer'}
        </>
      }
      closeButton={false}
      {...props}
    >
      <div>{JSON.stringify(metadata, null, 2)}</div>
    </DevToolsInfo>
  )
}
