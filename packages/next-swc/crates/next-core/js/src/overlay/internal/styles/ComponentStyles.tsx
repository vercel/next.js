import * as React from "react";

import { styles as codeFrame } from "../components/CodeFrame";
import { styles as dialog } from "../components/Dialog";
import { styles as leftRightDialogHeader } from "../components/LeftRightDialogHeader";
import { styles as overlay } from "../components/Overlay";
import { styles as tabs } from "../components/Tabs";
import { styles as terminal } from "../components/Terminal";
import { styles as toast } from "../components/Toast";
import { styles as buildErrorStyles } from "../container/BuildError";
import { styles as containerErrorStyles } from "../container/Errors";
import { styles as containerErrorToastStyles } from "../container/ErrorsToast";
import { styles as containerRuntimeErrorStyles } from "../container/RuntimeError";
import { noop as css } from "../helpers/noop-template";

export function ComponentStyles() {
  return (
    <style>
      {css`
        ${overlay}
        ${toast}
        ${dialog}
        ${leftRightDialogHeader}
        ${codeFrame}
        ${terminal}
        ${tabs}

        ${buildErrorStyles}
        ${containerErrorStyles}
        ${containerErrorToastStyles}
        ${containerRuntimeErrorStyles}
      `}
    </style>
  );
}
