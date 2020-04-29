import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-dialog-overlay] {
    position: fixed;
    top: 10vh;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: auto;
    z-index: 9000;

    display: flex;
    align-content: center;
    align-items: center;
    flex-direction: column;
    padding: 0 15px;
  }

  [data-nextjs-dialog-backdrop] {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background-color: rgba(17, 17, 17, 0.2);
    pointer-events: all;
    z-index: -1;
  }
`

export { styles }
