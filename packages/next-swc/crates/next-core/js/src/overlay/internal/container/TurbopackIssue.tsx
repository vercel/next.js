import { LeftRightDialogHeader } from '../components/LeftRightDialogHeader'
import { DialogBody, DialogBodyProps } from '../components/Dialog'
import { Terminal } from '../components/Terminal'
import { noop as css } from '../helpers/noop-template'
import { clsx } from '../helpers/clsx'
import { usePagination } from '../hooks/usePagination'

type TurbopackIssuesDialogBodyProps = {
  items: Issue[]
  message: string
  severity: 'error' | 'warning'
  'data-hidden'?: boolean
}

export function TurbopackIssuesDialogBody({
  items: issues,
  message,
  severity,
  'data-hidden': hidden = false,
  className,
  ...rest
}: TurbopackIssuesDialogBodyProps & Omit<DialogBodyProps, 'children'>) {
  const [activeIssue, { previous, next }, activeIdx] = usePagination(issues)

  const hasIssues = issues.length > 0

  if (!hasIssues || !activeIssue) {
    return null
  }

  const activeIssueIsError = ['bug', 'fatal', 'error'].includes(
    activeIssue.severity
  )

  return (
    <DialogBody
      {...rest}
      data-hidden={hidden}
      className={clsx('issues-body', className)}
    >
      <div className="title-pagination">
        <h1 id="nextjs__container_errors_label">{message}</h1>
        <LeftRightDialogHeader
          hidden={hidden}
          previous={activeIdx > 0 ? previous : null}
          next={activeIdx < issues.length - 1 ? next : null}
          severity={severity}
        >
          <small>
            <span>{activeIdx + 1}</span> of <span>{issues.length}</span>
          </small>
        </LeftRightDialogHeader>
      </div>

      <h2
        data-nextjs-dialog-header
        id="nextjs__container_errors_desc"
        data-severity={activeIssueIsError ? 'error' : 'warning'}
      >
        {activeIssue.title}
      </h2>

      <Terminal content={activeIssue.formatted} />
      {activeIssueIsError && (
        <footer>
          <p>
            <small>
              This error occurred during the build process and can only be
              dismissed by fixing the error.
            </small>
          </p>
        </footer>
      )}
    </DialogBody>
  )
}

export const styles = css`
  .issues-body > .terminal {
    margin-top: var(--size-gap-double);
  }

  .issues-body > footer {
    margin-top: var(--size-gap);
  }

  .issues-body > footer > p {
    margin: 0;
  }

  .issues-body > footer > small {
    color: #757575;
  }
`
