import { TYPE_UNHANDLED_ERROR, TYPE_UNHANDLED_REJECTION } from "../bus";
import { SupportedErrorEvent } from "../container/Errors";

import { getErrorSource } from "./nodeStackFrames";
import { getOriginalStackFrames, OriginalStackFrame } from "./stack-frame";

export type ReadyRuntimeError = {
  id: number;
  runtime: true;
  error: Error;
  frames: OriginalStackFrame[];
};

export async function getErrorByType(
  ev: SupportedErrorEvent
): Promise<ReadyRuntimeError> {
  const { id, event } = ev;
  switch (event.type) {
    case TYPE_UNHANDLED_ERROR:
    case TYPE_UNHANDLED_REJECTION: {
      return {
        id,
        runtime: true,
        error: event.reason,
        frames: await getOriginalStackFrames(
          event.frames,
          getErrorSource(event.reason),
          event.reason.toString()
        ),
      };
    }
    default: {
      break;
    }
  }

  throw new Error("type system invariant violation");
}
