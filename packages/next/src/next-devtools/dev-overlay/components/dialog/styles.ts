import { css } from '../../utils/css'

export const styles = css`
  [data-nextjs-dialog-root] {
    --next-dialog-radius: var(--rounded-xl);
    --next-dialog-max-width: 960px;
    --next-dialog-row-padding: 16px;
    --next-dialog-padding: 12px;
    --next-dialog-border-width: 1px;

    background-color: var(--color-gray-100);
    padding: 0 4px 4px 4px;
    border-radius: var(--rounded-2xl);
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: calc(100% - 56px);
    max-width: var(--next-dialog-max-width);
    margin-right: auto;
    margin-left: auto;
    scale: 0.97;
    opacity: 0;
    transition-property: scale, opacity;
    transition-duration: var(--transition-duration);
    transition-timing-function: var(--timing-overlay);

    &[data-rendered='true'] {
      opacity: 1;
      scale: 1;
    }
  }

  [data-nextjs-dialog] {
    outline: 0;
  }

  [data-nextjs-dialog-backdrop] {
    opacity: 0;
    transition: opacity var(--transition-duration) var(--timing-overlay);
  }

  [data-nextjs-dialog-overlay] {
    margin: 8px;
  }

  [data-nextjs-dialog-overlay][data-rendered='true']
    [data-nextjs-dialog-backdrop] {
    opacity: 1;
  }

  [data-nextjs-dialog-content] {
    border: none;
    margin: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    padding: 0;
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-header] {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 4px;
    margin-bottom: 8px;
    padding: 20px;
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-body] {
    position: relative;
    flex: 1 1 auto;
  }

  @media (max-height: 812px) {
    [data-nextjs-dialog-overlay] {
      max-height: calc(100% - 15px);
    }
  }

  @media (min-width: 576px) {
    [data-nextjs-dialog-root] {
      --next-dialog-max-width: 540px;
    }
  }

  @media (min-width: 768px) {
    [data-nextjs-dialog-root] {
      --next-dialog-max-width: 720px;
    }
  }

  @media (min-width: 992px) {
    [data-nextjs-dialog-root] {
      --next-dialog-max-width: 960px;
    }
  }
`
