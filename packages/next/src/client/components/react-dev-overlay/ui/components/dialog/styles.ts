const styles = `
  [data-nextjs-dialog-root] {
    --next-dialog-radius: var(--rounded-xl);
    --next-dialog-footer-height: 48px;
    --next-dialog-max-width: 960px;
    --next-dialog-row-padding: 16px;

    display: flex;
    flex-direction: column-reverse;
    width: 100%;
    max-height: calc(100% - 56px);
    max-width: var(--next-dialog-max-width);
    margin-right: auto;
    margin-left: auto;
    scale: 0.98;
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
    outline: none;
    overflow: hidden;
  }  
  [data-nextjs-dialog]::-webkit-scrollbar {
    width: 6px;
    border-radius: 0 0 1rem 1rem;
    margin-bottom: 1rem;
  }
  [data-nextjs-dialog]::-webkit-scrollbar-button {
    display: none;
  }
  /* css variables not working in scrollbar pseudo element */ 
  [data-nextjs-dialog]::-webkit-scrollbar-track {
    border-radius: 0 0 1rem 1rem;
    background-color: #fff;
  }
  [data-nextjs-dialog]::-webkit-scrollbar-thumb {
    border-radius: 1rem;
    background-color: #ddd;
  }

  @media (prefers-color-scheme: dark) {
    [data-nextjs-dialog]::-webkit-scrollbar-track {
      background-color: #0a0a0a;
    }
    [data-nextjs-dialog]::-webkit-scrollbar-thumb {
      background-color: #666;
    }
  }
  

  ${
    '' /* Place overflow: hidden on this so we can break out from [data-nextjs-dialog] */
  }
  [data-nextjs-dialog-sizer] {
    overflow: hidden;
    border-radius: inherit;
  }

  [data-nextjs-dialog-backdrop] {
    opacity: 0;
    transition: opacity var(--transition-duration) var(--timing-overlay);
  }

  [data-nextjs-dialog-overlay][data-rendered='true']
    [data-nextjs-dialog-backdrop] {
    opacity: 1;
  }

  [data-nextjs-dialog-content] {
    overflow-y: auto;
    border: none;
    margin: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    padding: var(--size-4) var(--size-3);
  }

  /* Account for the footer height, when present */
  [data-nextjs-dialog][data-has-footer='true'] [data-nextjs-dialog-body] {
    margin-bottom: var(--next-dialog-footer-height);
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-header] {
    flex-shrink: 0;
    margin-bottom: var(--size-2);
  }

  [data-nextjs-dialog-content] > [data-nextjs-dialog-body] {
    position: relative;
    flex: 1 1 auto;
  }

  [data-nextjs-dialog-footer] {
    /* Subtract border width */
    width: 100%;
    /* 
      We make this element fixed to anchor it to the bottom during the height transition.
      If you make this relative it will jump during the transition and not collapse or expand smoothly.
      If you make this absolute it will remain stuck at its initial position when scrolling the dialog.
    */
    position: fixed;
    bottom: 1px;
    border-left: 1px solid var(--color-gray-400);
    border-right: 1px solid var(--color-gray-400);
    min-height: var(--next-dialog-footer-height);
    border-radius: 0 0 var(--next-dialog-radius) var(--next-dialog-radius);
    overflow: hidden;

    > * {
      min-height: var(--next-dialog-footer-height);
    }
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

export { styles }
