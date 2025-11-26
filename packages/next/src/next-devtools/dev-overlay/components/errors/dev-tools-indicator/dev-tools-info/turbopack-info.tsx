import { CopyButton } from '../../../copy-button'

export function TurbopackInfoBody(props: React.ComponentProps<'div'>) {
  return (
    <>
      <article className="dev-tools-info-article" {...props}>
        <p className="dev-tools-info-paragraph">
          Turbopack is an incremental bundler optimized for JavaScript and
          TypeScript, written in Rust, and built into Next.js. Turbopack can be
          used in Next.js in both the{' '}
          <code className="dev-tools-info-code">pages</code> and{' '}
          <code className="dev-tools-info-code">app</code> directories for
          faster local development.
        </p>
        <p className="dev-tools-info-paragraph">
          To enable Turbopack, use the{' '}
          <code className="dev-tools-info-code">--turbopack</code> flag when
          running the Next.js development server.
        </p>
      </article>

      <div className="dev-tools-info-code-block-container">
        <div className="dev-tools-info-code-block">
          <CopyButton
            actionLabel="Copy Next.js Turbopack Command"
            successLabel="Next.js Turbopack Command Copied"
            content={'--turbopack'}
            className="dev-tools-info-copy-button"
          />
          <pre className="dev-tools-info-code-block-pre">
            <code>
              <div className="dev-tools-info-code-block-line">{'  '}</div>
              <div className="dev-tools-info-code-block-line">{'{'}</div>
              <div className="dev-tools-info-code-block-line">
                {'  '}
                <span className="dev-tools-info-code-block-json-key">
                  "scripts"
                </span>
                : {'{'}
              </div>
              <div className="dev-tools-info-code-block-line dev-tools-info-highlight">
                {'    '}
                <span className="dev-tools-info-code-block-json-key">
                  "dev"
                </span>
                :{' '}
                <span className="dev-tools-info-code-block-json-value">
                  "next dev --turbopack"
                </span>
                ,
              </div>
              <div className="dev-tools-info-code-block-line">
                {'    '}
                <span className="dev-tools-info-code-block-json-key">
                  "build"
                </span>
                :{' '}
                <span className="dev-tools-info-code-block-json-value">
                  "next build"
                </span>
                ,
              </div>
              <div className="dev-tools-info-code-block-line">
                {'    '}
                <span className="dev-tools-info-code-block-json-key">
                  "start"
                </span>
                :{' '}
                <span className="dev-tools-info-code-block-json-value">
                  "next start"
                </span>
                ,
              </div>
              <div className="dev-tools-info-code-block-line">
                {'    '}
                <span className="dev-tools-info-code-block-json-key">
                  "lint"
                </span>
                :{' '}
                <span className="dev-tools-info-code-block-json-value">
                  "next lint"
                </span>
              </div>
              <div className="dev-tools-info-code-block-line">{'  }'}</div>
              <div className="dev-tools-info-code-block-line">{'}'}</div>
              <div className="dev-tools-info-code-block-line">{'  '}</div>
            </code>
          </pre>
        </div>
      </div>
    </>
  )
}

export const DEV_TOOLS_INFO_TURBOPACK_INFO_STYLES = `
  .dev-tools-info-code {
    background: var(--color-gray-400);
    color: var(--color-gray-1000);
    font-family: var(--font-stack-monospace);
    padding: 2px 4px;
    margin: 0;
    font-size: var(--size-13);
    white-space: break-spaces;
    border-radius: var(--rounded-md-2);
  }

  .dev-tools-info-code-block-container {
    padding: 6px;
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
    font-family: var(--font-stack-monospace);
    font-size: var(--size-12);
  }

  .dev-tools-info-copy-button {
    position: absolute;

    display: flex;
    justify-content: center;
    align-items: center;
    right: 8px;
    top: 8px;
    padding: 4px;
    height: var(--size-24);
    width: var(--size-24);
    border-radius: var(--rounded-md-2);
    border: 1px solid var(--color-gray-alpha-400);
    background: var(--color-background-100);
  }

  .dev-tools-info-code-block-line {
    display: block;
    line-height: 1.5;
    padding: 0 16px;
  }

  .dev-tools-info-code-block-line.dev-tools-info-highlight {
    border-left: 2px solid var(--color-blue-900);
    background: var(--color-blue-400);
  }

  .dev-tools-info-code-block-json-key {
    color: var(--color-syntax-keyword);
  }

  .dev-tools-info-code-block-json-value {
    color: var(--color-syntax-link);
  }
`
