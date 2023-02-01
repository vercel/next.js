import { Toast } from "../components/Toast";
import { AlertOctagon, AlertTriangle, CloseIcon } from "../icons";
import { noop as css } from "../helpers/noop-template";

export type ErrorsToastProps = {
  errorCount: number;
  severity: "error" | "warning";
  onClick: () => void;
  onClose: () => void;
};

export function ErrorsToast({
  errorCount,
  severity,
  onClick,
  onClose,
}: ErrorsToastProps) {
  return (
    <Toast className="toast-errors" onClick={onClick} data-severity={severity}>
      <div className="toast-errors-body">
        {severity == "error" && <AlertOctagon />}
        {severity == "warning" && <AlertTriangle />}
        <span>
          {errorCount} {severity}
          {errorCount > 1 ? "s" : ""}
        </span>
        <button
          data-toast-errors-hide-button
          className="toast-errors-hide-button"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={
            { error: "Hide Errors", warning: "Hide Warnings" }[severity]
          }
        >
          <CloseIcon />
        </button>
      </div>
    </Toast>
  );
}

export const styles = css`
  .toast-errors {
    cursor: pointer;
    transition: transform 0.2s ease;
    will-change: transform;
  }

  .toast-errors:hover {
    transform: scale(1.025);
  }

  .toast-errors-body {
    display: flex;
    align-items: center;
    align-content: center;
    justify-content: flex-start;
  }

  .toast-errors-body > svg {
    margin-right: var(--size-gap);
  }

  .toast-errors-hide-button {
    display: flex;
    margin-left: var(--size-gap-triple);
    border: none;
    background: none;
    color: var(--color-text-white);
    padding: 0;
    transition: transform, opacity 0.25s ease;
    opacity: 0.7;
  }

  .toast-errors-hide-button:hover {
    opacity: 1;
  }
`;
