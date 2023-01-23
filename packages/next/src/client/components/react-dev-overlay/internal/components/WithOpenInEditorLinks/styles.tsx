import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-with-open-in-editor-link] svg {
    width: auto;
    height: var(--size-font-small);
    margin-left: var(--size-gap);
  }
  [data-with-open-in-editor-link] {
    cursor: pointer;
  }
  [data-with-open-in-editor-link]:hover {
    text-decoration: underline dotted;
  }
  [data-with-open-in-editor-link] {
    margin-left: var(--size-gap-double);
  }
`

export { styles }
