import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .nextjs-container-build-error-version-status {
    flex: 1;
    text-align: right;
    font-size: var(--size-font-small);
  }
  .nextjs-container-build-error-version-status span {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 5px;
    background: var(--color-ansi-bright-black);
  }
  .nextjs-container-build-error-version-status span.fresh {
    background: var(--color-ansi-green);
  }
  .nextjs-container-build-error-version-status span.stale {
    background: var(--color-ansi-yellow);
  }
  .nextjs-container-build-error-version-status span.outdated {
    background: var(--color-ansi-red);
  }
`

export { styles }
