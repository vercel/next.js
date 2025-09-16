import { Tooltip } from '../tooltip/tooltip'
import { InfoIcon } from './segment-explorer'

export function SegmentSuggestion({
  possibleExtension,
  missingGlobalError,
}: {
  possibleExtension: string
  missingGlobalError: boolean
}) {
  const tooltip = missingGlobalError
    ? `No global-error.${possibleExtension} found: Add one to ensure users see a helpful message when an unexpected error occurs.`
    : null
  return (
    <span className="segment-explorer-suggestions">
      <Tooltip className="segment-explorer-suggestions-tooltip" title={tooltip}>
        <InfoIcon />
      </Tooltip>
    </span>
  )
}
