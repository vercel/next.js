import { Tooltip } from '../../../components/tooltip'
import { InfoIcon } from './segment-explorer'

export function SegmentSuggestion({
  possibleExtension,
  missingBoundaryTypes,
}: {
  possibleExtension: string
  missingBoundaryTypes: string[]
}) {
  const tooltip = `This segment may be missing the following files: ${missingBoundaryTypes
    .map((type) => `${type}.${possibleExtension}`)
    .join(', ')}`
  return (
    <span className="segment-explorer-suggestions">
      <Tooltip className="segment-explorer-suggestions-tooltip" title={tooltip}>
        <InfoIcon />
      </Tooltip>
    </span>
  )
}
