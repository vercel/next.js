import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-dialog-left-right] {
    display: flex;
    flex-direction: row;
    align-content: center;
    align-items: center;
    justify-content: space-between;
  }
  [data-nextjs-dialog-left-right] > nav > button {
    border: none;
    border-radius: 4px;
    background-color: rgba(230, 0, 0, 0.1);
    color: rgba(230, 0, 0, 1);
    padding: 3px 9px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.25s ease;
  }
  [data-nextjs-dialog-left-right] > nav > button:hover {
    background-color: rgba(230, 0, 0, 0.2);
  }
  [data-nextjs-dialog-left-right] > nav > button:disabled {
    background-color: rgba(230, 0, 0, 0.1);
    color: rgba(230, 0, 0, 0.2);
    cursor: not-allowed;
  }

  [data-nextjs-dialog-left-right] > nav > button:first-of-type {
    border-top-right-radius: 0px;
    border-bottom-right-radius: 0px;
    margin-right: 1px;
  }
  [data-nextjs-dialog-left-right] > nav > button:last-of-type {
    border-top-left-radius: 0px;
    border-bottom-left-radius: 0px;
  }

  [data-nextjs-dialog-left-right] > button:last-of-type {
    border: 0;
    padding: 0;

    background-color: transparent;
    appearance: none;

    opacity: 0.4;
    transition: opacity 0.25s ease;
  }
  [data-nextjs-dialog-left-right] > button:last-of-type:hover {
    opacity: 0.7;
  }
`

export { styles }
