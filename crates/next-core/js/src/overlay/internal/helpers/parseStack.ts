import {
  parse,
  StackFrame,
} from "@vercel/turbopack-next/compiled/stacktrace-parser";

const regexNextStatic = /\/_next(\/static\/.+)/g;

export function parseStack(stack: string): StackFrame[] {
  const frames = parse(stack);
  return frames.map((frame) => {
    try {
      const url = new URL(frame.file!);
      const res = regexNextStatic.exec(url.pathname);
      if (res) {
        const distDir = process.env.__NEXT_DIST_DIR
          ?.replace(/\\/g, "/")
          ?.replace(/\/$/, "");
        if (distDir) {
          frame.file = "file://" + distDir.concat(res.pop()!);
        }
      }
    } catch {}
    return frame;
  });
}
