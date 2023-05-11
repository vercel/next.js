import { noop as css } from '../../helpers/noop-template'

const styles = css`
  .dialog-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: auto;
    z-index: 9000;

    display: flex;
    align-content: center;
    align-items: center;
    flex-direction: column;
    padding: 10vh 15px 0;
  }

  @media (max-height: 812px) {
    .dialog-overlay {
      padding: 15px 15px 0;
    }
  }

  .dialog-backdrop {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background-color: rgba(17, 17, 17, 0.2);
    pointer-events: all;
    z-index: -1;
  }

  .dialog-backdrop[data-dialog-backdrop-fixed] {
    cursor: not-allowed;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
`

export { styles }
