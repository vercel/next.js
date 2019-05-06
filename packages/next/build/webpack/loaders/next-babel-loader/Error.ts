const STRIP_FILENAME_RE = /^[^:]+: /;

const format = (err: any) => {
  if (err instanceof SyntaxError) {
    err.name = "SyntaxError";
    err.message = err.message.replace(STRIP_FILENAME_RE, "");

    // @ts-ignore
    err.hideStack = true;
  } else if (err instanceof TypeError) {
    // @ts-ignore
    err.name = null;
    err.message = err.message.replace(STRIP_FILENAME_RE, "");
    // @ts-ignore
    err.hideStack = true;
  }

  return err;
};

export default class LoaderError extends Error {
  name: string
  hideStack: any

  constructor(err: any) {
    super();
    const { name, message, codeFrame, hideStack } = format(err);

    this.name = "BabelLoaderError";
    this.message = `${name ? `${name}: ` : ""}${message}\n\n${codeFrame}\n`;
    this.hideStack = hideStack;
    Error.captureStackTrace(this, this.constructor);
  }
}
