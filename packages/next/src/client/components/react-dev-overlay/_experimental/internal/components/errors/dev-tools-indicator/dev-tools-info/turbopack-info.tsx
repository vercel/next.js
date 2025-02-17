import { DevToolsInfo } from './dev-tools-info'
import { CopyButton } from '../../../copy-button'
import { noop as css } from '../../../../helpers/noop-template'

export function TurbopackInfo({
  isOpen,
  setIsOpen,
  setPreviousOpen,
  ...props
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  setPreviousOpen: (isOpen: boolean) => void
  style?: React.CSSProperties
  ref?: React.RefObject<HTMLElement | null>
}) {
  return (
    <DevToolsInfo
      title="Turbopack"
      learnMoreLink="https://nextjs.org/docs/app/api-reference/turbopack"
      setIsOpen={setIsOpen}
      setPreviousOpen={setPreviousOpen}
      {...props}
    >
      <p className="dev-tools-info-paragraph">
        Turbopack is an incremental bundler optimized for JavaScript and
        TypeScript, written in Rust, and built into Next.js. To enable, include
        the following flag in your next config file:
      </p>

      <div className="dev-tools-info-code-container">
        <div className="dev-tools-info-code-block">
          <CopyButton
            actionLabel="Copy Next.js Turbopack Command"
            successLabel="Next.js Turbopack Command Copied"
            content={'--turbopack'}
            className="dev-tools-info-copy-button"
          />
          <pre className="dev-tools-info-code-block-pre">
            <code>
              <div className="dev-tools-info-code-line">{'  '}</div>
              <div className="dev-tools-info-code-line">{'{'}</div>
              <div className="dev-tools-info-code-line">
                {'  '}
                <span className="dev-tools-info-code-json-key">
                  "scripts"
                </span>: {'{'}
              </div>
              <div className="dev-tools-info-code-line dev-tools-info-highlight">
                {'    '}
                <span className="dev-tools-info-code-json-key">
                  "dev"
                </span>:{' '}
                <span className="dev-tools-info-code-json-value">
                  "next dev --turbopack"
                </span>
                ,
              </div>
              <div className="dev-tools-info-code-line">
                {'    '}
                <span className="dev-tools-info-code-json-key">
                  "build"
                </span>:{' '}
                <span className="dev-tools-info-code-json-value">
                  "next build"
                </span>
                ,
              </div>
              <div className="dev-tools-info-code-line">
                {'    '}
                <span className="dev-tools-info-code-json-key">
                  "start"
                </span>:{' '}
                <span className="dev-tools-info-code-json-value">
                  "next start"
                </span>
                ,
              </div>
              <div className="dev-tools-info-code-line">
                {'    '}
                <span className="dev-tools-info-code-json-key">
                  "lint"
                </span>:{' '}
                <span className="dev-tools-info-code-json-value">
                  "next lint"
                </span>
              </div>
              <div className="dev-tools-info-code-line">{'  }'}</div>
              <div className="dev-tools-info-code-line">{'}'}</div>
              <div className="dev-tools-info-code-line">{'  '}</div>
            </code>
          </pre>
        </div>
      </div>
    </DevToolsInfo>
  )
}

export const DEV_TOOLS_INFO_TURBOPACK_INFO_STYLES = css`
  .dev-tools-info-code-container {
    padding: var(--size-1_5);
  }

  .dev-tools-info-code-block {
    position: relative;
    background: var(--color-background-200);
    border: 1px solid var(--color-gray-alpha-400);
    border-radius: var(--rounded-md-2);
    min-width: 326px;
  }

  .dev-tools-info-code-block-pre {
    margin: 0;
    font-family: var(--font-stack-mono);
    font-size: 12px;
  }

  .dev-tools-info-copy-button {
    position: absolute;

    display: flex;
    justify-content: center;
    align-items: center;
    right: var(--size-2);
    top: var(--size-2);
    padding: var(--size-1);
    height: var(--size-6);
    width: var(--size-6);
    border-radius: var(--rounded-md-2);
    border: 1px solid var(--color-gray-alpha-400);
    background: var(--color-background-100);
  }

  .dev-tools-info-code-line {
    display: block;
    line-height: 1.5;
    padding: 0 1rem;
  }

  .dev-tools-info-code-line.dev-tools-info-highlight {
    border-left: 2px solid var(--color-blue-900);
    background: var(--color-blue-400);
  }

  .dev-tools-info-code-json-key {
    color: var(--color-syntax-keyword);
  }

  .dev-tools-info-code-json-value {
    color: var(--color-syntax-link);
  }
`
