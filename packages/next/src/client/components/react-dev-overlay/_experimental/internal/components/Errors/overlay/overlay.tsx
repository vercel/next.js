import { noop as css } from '../../../helpers/noop-template'
import { Overlay, type OverlayProps } from '../../Overlay/Overlay'

export function ErrorOverlayOverlay({ children, ...props }: OverlayProps) {
  return <Overlay {...props}>{children}</Overlay>
}

export const OVERLAY_STYLES = css`
  [data-nextjs-dialog-overlay] {
    top: var(--size-8_5);
  }
`
