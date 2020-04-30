import { noop as css } from '../../helpers/noop-template'

const styles = css`
  [data-nextjs-dialog] {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin-right: auto;
    margin-left: auto;
    outline: none;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 0.25rem 0.5rem rgba(22, 28, 45, 0.5);
    max-height: calc(100% - 3.5rem);
    overflow-y: hidden;
  }

  @media (min-width: 576px) {
    [data-nextjs-dialog] {
      max-width: 540px;
      box-shadow: 0 0.5rem 1rem rgba(22, 28, 45, 0.5);
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

  [data-nextjs-dialog-banner] {
    position: relative;
  }
  [data-nextjs-dialog-banner].banner-warning {
    border-color: var(--color-ansi-bright-yellow);
  }
  [data-nextjs-dialog-banner].banner-error {
    border-color: var(--color-ansi-bright-red);
  }

  [data-nextjs-dialog-banner]::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 100%;
    border-top-width: 5px;
    border-bottom-width: calc(0.375rem - 5px);
    border-top-style: solid;
    border-bottom-style: solid;
    border-top-color: inherit;
    border-bottom-color: transparent;
    border-top-left-radius: 0.375rem;
    border-top-right-radius: 0.375rem;
  }

  [data-nextjs-dialog-content] {
    border: none;
    margin: 0;
    padding: 1rem;

    height: 100%;
    display: flex;
    flex-direction: column;
  }
  [data-nextjs-dialog-content] > [data-nextjs-dialog-header] {
    flex-shrink: 0;
  }
  [data-nextjs-dialog-content] > [data-nextjs-dialog-body] {
    position: relative;
    flex: 1 1 auto;
    overflow-y: auto;
  }
`

export { styles }
