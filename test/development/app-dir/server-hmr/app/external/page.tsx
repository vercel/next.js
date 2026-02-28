import { value } from 'hmr-external'
import { fileValue } from '../../lib/hmr-file-external'

export default function ExternalPage() {
  return (
    <>
      <p id="value">{value}</p>
      <p id="file-value">{fileValue}</p>
    </>
  )
}
