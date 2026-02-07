export function ErrorOverlayBottomStack({
  errorCount,
  activeIdx,
}: {
  errorCount: number
  activeIdx: number
}) {
  // If there are more than 2 errors to navigate, the stack count should remain at 2.
  const stackCount = Math.min(errorCount - activeIdx - 1, 2)
  return (
    <div aria-hidden className="error-overlay-bottom-stack">
      <div
        className="error-overlay-bottom-stack-stack"
        data-stack-count={stackCount}
      >
        <div className="error-overlay-bottom-stack-layer error-overlay-bottom-stack-layer-1">
          1
        </div>
        <div className="error-overlay-bottom-stack-layer error-overlay-bottom-stack-layer-2">
          2
        </div>
      </div>
    </div>
  )
}

export const styles = `
  .error-overlay-bottom-stack-layer {
    width: 100%;
    height: var(--stack-layer-height);
    position: relative;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    background: var(--color-background-200);
    transition:
      translate 350ms var(--timing-swift),
      box-shadow 350ms var(--timing-swift);
  }

  .error-overlay-bottom-stack-layer-1 {
    width: calc(100% - var(--size-24));
  }

  .error-overlay-bottom-stack-layer-2 {
    width: calc(100% - var(--size-48));
    z-index: -1;
  }

  .error-overlay-bottom-stack {
    width: 100%;
    position: absolute;
    bottom: -1px;
    height: 0;
    overflow: visible;
  }

  .error-overlay-bottom-stack-stack {
    --stack-layer-height: 44px;
    --stack-layer-height-half: calc(var(--stack-layer-height) / 2);
    --stack-layer-trim: 13px;
    --shadow: 0px 0.925px 0.925px 0px rgba(0, 0, 0, 0.02),
      0px 3.7px 7.4px -3.7px rgba(0, 0, 0, 0.04),
      0px 14.8px 22.2px -7.4px rgba(0, 0, 0, 0.06);

    display: grid;
    place-items: center center;
    width: 100%;
    position: fixed;
    height: 0;
    overflow: visible;
    z-index: -1;
    max-width: var(--next-dialog-max-width);

    .error-overlay-bottom-stack-layer {
      grid-area: 1 / 1;
      /* Hide */
      translate: 0 calc(var(--stack-layer-height) * -1);
    }

    &[data-stack-count='1'],
    &[data-stack-count='2'] {
      .error-overlay-bottom-stack-layer-1 {
        translate: 0
          calc(var(--stack-layer-height-half) * -1 - var(--stack-layer-trim));
      }
    }

    &[data-stack-count='2'] {
      .error-overlay-bottom-stack-layer-2 {
        translate: 0 calc(var(--stack-layer-trim) * -1 * 2);
      }
    }

    /* Only the bottom stack should have the shadow */
    &[data-stack-count='1'] .error-overlay-bottom-stack-layer-1 {
      box-shadow: var(--shadow);
    }

    &[data-stack-count='2'] {
      .error-overlay-bottom-stack-layer-2 {
        box-shadow: var(--shadow);
      }
    }
  }
`
