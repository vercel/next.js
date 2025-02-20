import { noop as css } from '../../../helpers/noop-template'

export function ErrorOverlayBottomStack({
  count,
  activeIdx,
}: {
  count: number
  activeIdx: number
}) {
  let stackCount = '0'

  if (count > 1) {
    stackCount = '1'
  }

  if (count > 2) {
    stackCount = '2'
  }

  if (activeIdx === 1) {
    stackCount = '1'
  }

  if (activeIdx > 1) {
    stackCount = '0'
  }

  return (
    <div aria-hidden className="error-overlay-bottom-stack">
      <div className="stack" data-stack-count={stackCount}>
        <div className="layer layer1">1</div>
        <div className="layer layer2">2</div>
      </div>
    </div>
  )
}

export const styles = css`
  .layer {
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

  .layer1 {
    width: calc(100% - var(--size-6));
  }

  .layer2 {
    width: calc(100% - var(--size-12));
    z-index: -1;
  }

  .error-overlay-bottom-stack {
    width: 100%;
    position: absolute;
    bottom: -1px;
    height: 0;
    overflow: visible;
  }

  .stack {
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
    overflow: hidden;
    z-index: -1;
    max-width: var(--next-dialog-max-width);

    .layer {
      grid-area: 1 / 1;
      /* Hide */
      translate: 0 calc(var(--stack-layer-height) * -1);
    }

    &[data-stack-count='1'],
    &[data-stack-count='2'] {
      .layer1 {
        translate: 0
          calc(var(--stack-layer-height-half) * -1 - var(--stack-layer-trim));
      }
    }

    &[data-stack-count='2'] {
      .layer2 {
        translate: 0 calc(var(--stack-layer-trim) * -1 * 2);
      }
    }

    /* Only the bottom stack should have the shadow */
    &[data-stack-count='1'] .layer1 {
      box-shadow: var(--shadow);
    }

    &[data-stack-count='2'] {
      .layer2 {
        box-shadow: var(--shadow);
      }
    }
  }

  @media (prefers-color-scheme: dark) {
    .layer {
      border-color: var(--color-gray-400);
    }
  }
`
