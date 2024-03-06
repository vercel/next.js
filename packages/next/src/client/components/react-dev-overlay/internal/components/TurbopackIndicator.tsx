import { noop as css } from '../helpers/noop-template'
import { TurbopackIcon } from '../icons/TurbopackIcon'

export function TurbopackIndicator() {
  if (!process.env.TURBOPACK) return null
  return (
    <a
      data-nextjs-turbopack-indicator
      href="https://turbo.build/pack"
      title="Powered by Turbopack"
      target="_blank"
      rel="noopener noreferrer"
    >
      <TurbopackIcon />
    </a>
  )
}

export const styles = process.env.TURBOPACK
  ? css`
      [data-nextjs-turbopack-indicator] > svg {
        position: absolute;
        bottom: 0;
        right: 0;
      }
    `
  : ''
