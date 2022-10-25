import {
  parse as parseStackTrace,
  StackFrame,
} from "@vercel/turbopack-next/compiled/stacktrace-parser";

export type StructuredError = {
  name: string;
  message: string;
  stack: StackFrame[];
};

export function structuredError(e: Error): StructuredError {
  return {
    name: e.name,
    message: e.message,
    stack: parseStackTrace(e.stack!),
  };
}
