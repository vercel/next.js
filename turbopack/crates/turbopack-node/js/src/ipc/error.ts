// merged from next.js
// https://github.com/vercel/next.js/blob/e657741b9908cf0044aaef959c0c4defb19ed6d8/packages/next/src/lib/is-error.ts
// https://github.com/vercel/next.js/blob/e657741b9908cf0044aaef959c0c4defb19ed6d8/packages/next/src/shared/lib/is-plain-object.ts

export default function isError(err: unknown): err is Error {
  return (
    typeof err === "object" && err !== null && "name" in err && "message" in err
  );
}

export function getProperError(err: unknown): Error {
  if (isError(err)) {
    return err;
  }

  if (process.env.NODE_ENV === "development") {
    // Provide a better error message for cases where `throw undefined`
    // is called in development
    if (typeof err === "undefined") {
      return new Error("`undefined` was thrown instead of a real error");
    }

    if (err === null) {
      return new Error("`null` was thrown instead of a real error");
    }
  }

  return new Error(isPlainObject(err) ? JSON.stringify(err) : err + "");
}

function getObjectClassLabel(value: any): string {
  return Object.prototype.toString.call(value);
}

function isPlainObject(value: any): boolean {
  if (getObjectClassLabel(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  /**
   * this used to be previously:
   *
   * `return prototype === null || prototype === Object.prototype`
   *
   * but Edge Runtime expose Object from vm, being that kind of type-checking wrongly fail.
   *
   * It was changed to the current implementation since it's resilient to serialization.
   */
  return prototype === null || prototype.hasOwnProperty("isPrototypeOf");
}
