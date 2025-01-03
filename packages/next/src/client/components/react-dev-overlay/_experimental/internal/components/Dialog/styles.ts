import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-dialog] {
    z-index: 50;
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-right: auto;
    margin-left: auto;
    outline: none;
    background: var(--color-background);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-md);
    max-height: calc(100% - 56px);
    overflow-y: hidden;
  }

  @media (max-height: 812px) {
    [data-nextjs-dialog-overlay] {
      max-height: calc(100% - 15px);
    }
  }

  @media (min-width: 576px) {
    [data-nextjs-dialog] {
      max-width: 540px;
      box-shadow: var(--shadow-2xl);
    }
  }

  @media (min-width: 768px) {
    [data-nextjs-dialog] {
      max-width: 720px;
    }
  }

  @media (min-width: 992px) {
    [data-nextjs-dialog] {
      max-width: 960px;
    }
  }

  [data-nextjs-dialog-content] {
    overflow-y: auto;
    border: none;
    margin: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  [data-nextjs-dialog-content] > [data-nextjs-dialog-header] {
    flex-shrink: 0;
    padding: var(--size-4);
    border-top: 1px solid var(--color-gray-400);
    border-left: 1px solid var(--color-gray-400);
    border-right: 1px solid var(--color-gray-400);
    border-top-left-radius: var(--rounded-xl);
    border-top-right-radius: var(--rounded-xl);
  }
  [data-nextjs-dialog-content] > [data-nextjs-dialog-body] {
    position: relative;
    flex: 1 1 auto;
  }
`

export { styles }
