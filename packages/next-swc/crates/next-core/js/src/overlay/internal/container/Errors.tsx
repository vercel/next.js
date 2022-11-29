import * as React from "react";

import {
  TYPE_UNHANDLED_ERROR,
  TYPE_UNHANDLED_REJECTION,
  UnhandledError,
  UnhandledRejection,
} from "../bus";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogHeaderTabList,
  DialogProps,
} from "../components/Dialog";
import { Overlay } from "../components/Overlay";
import { Tab, TabPanel, Tabs } from "../components/Tabs";
import { getErrorByType, ReadyRuntimeError } from "../helpers/getErrorByType";
import { getErrorSource } from "../helpers/nodeStackFrames";
import { noop as css } from "../helpers/noop-template";
import { AlertOctagon } from "../icons";
import { RuntimeErrorsDialogBody } from "./RuntimeError";
import { ErrorsToast } from "../container/ErrorsToast";

export type SupportedErrorEvent = {
  id: number;
  event: UnhandledError | UnhandledRejection;
};
export type ErrorsProps = {
  errors: SupportedErrorEvent[];
};

type ReadyErrorEvent = ReadyRuntimeError;

function getErrorSignature(ev: SupportedErrorEvent): string {
  const { event } = ev;
  switch (event.type) {
    case TYPE_UNHANDLED_ERROR:
    case TYPE_UNHANDLED_REJECTION: {
      return `${event.reason.name}::${event.reason.message}::${event.reason.stack}`;
    }
    default: {
      return "";
    }
  }
}

function useResolvedErrors(
  errors: SupportedErrorEvent[]
): [ReadyRuntimeError[], boolean] {
  const [lookups, setLookups] = React.useState(
    {} as { [eventId: string]: ReadyErrorEvent }
  );

  const [readyErrors, nextError] = React.useMemo<
    [ReadyErrorEvent[], SupportedErrorEvent | null]
  >(() => {
    const ready: ReadyErrorEvent[] = [];
    let next: SupportedErrorEvent | null = null;

    // Ensure errors are displayed in the order they occurred in:
    for (let idx = 0; idx < errors.length; ++idx) {
      const e = errors[idx];
      const { id } = e;
      if (id in lookups) {
        ready.push(lookups[id]);
        continue;
      }

      // Check for duplicate errors
      if (idx > 0) {
        const prev = errors[idx - 1];
        if (getErrorSignature(prev) === getErrorSignature(e)) {
          continue;
        }
      }

      next = e;
      break;
    }

    return [ready, next];
  }, [errors, lookups]);

  const isLoading = React.useMemo<boolean>(() => {
    return readyErrors.length < 1 && errors.length > 1;
  }, [errors.length, readyErrors.length]);

  React.useEffect(() => {
    if (nextError == null) {
      return;
    }
    let mounted = true;

    getErrorByType(nextError).then(
      (resolved) => {
        // We don't care if the desired error changed while we were resolving,
        // thus we're not tracking it using a ref. Once the work has been done,
        // we'll store it.
        if (mounted) {
          setLookups((m) => ({ ...m, [resolved.id]: resolved }));
        }
      },
      () => {
        // TODO: handle this, though an edge case
      }
    );

    return () => {
      mounted = false;
    };
  }, [nextError]);

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but let's handle it.
  React.useEffect(() => {
    if (errors.length < 1) {
      setLookups({});
    }
  }, [errors.length]);

  return [readyErrors, isLoading];
}

const enum TabId {
  RuntimeErrors = "runtime-errors",
}

export function Errors({ errors }: ErrorsProps) {
  const [displayState, setDisplayState] = React.useState<
    "minimized" | "fullscreen" | "hidden"
  >("fullscreen");

  const [readyErrors, isLoading] = useResolvedErrors(errors);

  // Reset component state when there are no errors to be displayed.
  // This should never happen, but let's handle it.
  React.useEffect(() => {
    if (errors.length < 1) {
      setDisplayState("hidden");
    }
  }, [errors.length]);

  const minimize = React.useCallback((e?: MouseEvent | TouchEvent) => {
    e?.preventDefault();
    setDisplayState("minimized");
  }, []);
  const hide = React.useCallback((e?: MouseEvent | TouchEvent) => {
    e?.preventDefault();
    setDisplayState("hidden");
  }, []);
  const fullscreen = React.useCallback(
    (e?: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      e?.preventDefault();
      setDisplayState("fullscreen");
    },
    []
  );

  const hasErrors = errors.length > 0;
  const hasServerError = readyErrors.some((err) =>
    ["server", "edge-server"].includes(getErrorSource(err.error) || "")
  );
  const isClosable = !isLoading && !hasServerError;

  const defaultTab = TabId.RuntimeErrors;
  const [selectedTab, setSelectedTab] = React.useState<string>(defaultTab);

  // This component shouldn't be rendered with no errors, but if it is, let's
  // handle it gracefully by rendering nothing.
  if (errors.length < 1) {
    return null;
  }

  if (displayState === "hidden") {
    return null;
  }

  if (displayState === "minimized") {
    return (
      <ErrorsToast
        errorCount={readyErrors.length}
        onClick={fullscreen}
        onClose={hide}
      />
    );
  }

  return (
    <ErrorsDialog
      aria-labelledby="errors_label"
      aria-describedby="errors_desc"
      onClose={isClosable ? minimize : undefined}
    >
      <Tabs
        defaultId={defaultTab}
        selectedId={selectedTab}
        onChange={setSelectedTab}
      >
        <DialogHeader
          className="errors-header"
          close={isClosable ? minimize : undefined}
        >
          <DialogHeaderTabList>
            {hasErrors && (
              <Tab id={TabId.RuntimeErrors} data-severity="error">
                <AlertOctagon />
                {isLoading ? "Loading" : readyErrors.length} Runtime Errors
                {isLoading ? "..." : null}
              </Tab>
            )}
          </DialogHeaderTabList>
        </DialogHeader>
        {hasErrors && (
          <TabPanel
            as={RuntimeErrorsDialogBody}
            id={TabId.RuntimeErrors}
            isLoading={isLoading}
            readyErrors={readyErrors}
            className="errors-body"
          />
        )}
      </Tabs>
    </ErrorsDialog>
  );
}

function ErrorsDialog({ children, ...props }: DialogProps) {
  return (
    <Overlay>
      <Dialog {...props}>
        <DialogContent>{children}</DialogContent>
      </Dialog>
    </Overlay>
  );
}

export const styles = css`
  /** == Header == */

  .errors-header > .tab-list > .tab > svg {
    margin-right: var(--size-gap);
  }

  .errors-header > .tab-list > .tab[data-severity="error"] > svg {
    color: var(--color-error);
  }

  .errors-header > .tab-list > .tab[data-severity="warning"] > svg {
    color: var(--color-warning);
  }

  .errors-header > .tab-list > .tab {
    position: relative;
  }

  .errors-header > .tab-list > .tab[data-severity="error"]::after {
    border-top-color: var(--color-error);
  }

  .errors-header > .tab-list > .tab[data-severity="warning"]::after {
    border-top-color: var(--color-warning);
  }

  /** == Body == */

  .errors-body {
    display: flex;
    flex-direction: column;
    overflow-y: hidden;
  }

  .errors-body > .title-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;

    margin-bottom: var(--size-gap);
  }

  .errors-body > .title-pagination > nav > small {
    font-size: var(--size-font-small);
    color: var(--color-text-dim);
    margin-right: var(--size-gap);
    opacity: 0.7;
  }

  .errors-body > .title-pagination > nav > small > span {
    font-family: var(--font-mono);
  }

  .errors-body > .title-pagination > h1 {
    font-size: var(--size-font-big);
    color: var(--color-text-dim);
    margin: 0;
    opacity: 0.9;
  }

  .errors-body > h2 {
    font-family: var(--font-mono);
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: 0;
    margin-bottom: var(--size-gap);
    color: var(--color-error);
    white-space: pre-wrap;
  }

  .errors-body > h2[data-severity="error"] {
    color: var(--color-error);
  }

  .errors-body > h2[data-severity="warning"] {
    color: var(--color-warning);
  }

  .errors-body > div > small {
    margin: 0;
    margin-top: var(--size-gap-half);
  }

  .errors-body > h2 > a {
    color: var(--color-error);
  }

  .errors-body > h5:not(:first-child) {
    margin-top: var(--size-gap-double);
  }

  .errors-body > h5 {
    margin-bottom: var(--size-gap);
  }
`;
