import { noop as css } from '../../../helpers/noop-template'
import { Overlay, type OverlayProps } from '../../overlay/overlay'

export function ErrorOverlayOverlay({ children, ...props }: OverlayProps) {
  return <Overlay {...props}>{children}</Overlay>
}

export const OVERLAY_STYLES = css`
  [data-nextjs-dialog-overlay] {
    padding: initial;
    top: 10vh;
  }
`
