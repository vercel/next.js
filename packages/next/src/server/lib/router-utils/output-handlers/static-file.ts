import { HandleOutputCtx } from '../handle-output'
import { serveStatic } from '../../../serve-static'

export async function handleStaticFile(ctx: HandleOutputCtx) {
  const { req, res, output: matchedOutput, dev, fsChecker } = ctx

  if (
    dev &&
    (fsChecker.appFiles.has(matchedOutput.itemPath) ||
      fsChecker.pageFiles.has(matchedOutput.itemPath))
  ) {
    throw new Error(
      `A conflicting public file and page file was found for path ${matchedOutput.itemPath} https://nextjs.org/docs/messages/conflicting-public-file-page`
    )
  }

  if (
    !res.getHeader('cache-control') &&
    matchedOutput.type === 'nextStaticFolder'
  ) {
    if (dev) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  }
  if (!(req.method === 'GET' || req.method === 'HEAD')) {
    res.setHeader('Allow', ['GET', 'HEAD'])
    const err = new Error(`Method Not Allowed`)
    ;(err as any).statusCode = 405
    throw err
  }

  try {
    return await serveStatic(req, res, matchedOutput.itemPath, {
      root: matchedOutput.itemsRoot,
    })
  } catch (err: any) {
    /**
     * Hardcoded every possible error status code that could be thrown by "serveStatic" method
     * This is done by searching "this.error" inside "send" module's source code:
     * https://github.com/pillarjs/send/blob/master/index.js
     * https://github.com/pillarjs/send/blob/develop/index.js
     */
    const POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC = new Set([
      // send module will throw 500 when header is already sent or fs.stat error happens
      // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L392
      // Note: we will use Next.js built-in 500 page to handle 500 errors
      // 500,

      // send module will throw 404 when file is missing
      // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L421
      // Note: we will use Next.js built-in 404 page to handle 404 errors
      // 404,

      // send module will throw 403 when redirecting to a directory without enabling directory listing
      // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L484
      // Note: Next.js throws a different error (without status code) for directory listing
      // 403,

      // send module will throw 400 when fails to normalize the path
      // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L520
      400,

      // send module will throw 412 with conditional GET request
      // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L632
      412,

      // send module will throw 416 when range is not satisfiable
      // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L669
      416,
    ])

    let validErrorStatus = POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC.has(
      err.statusCode
    )

    // normalize non-allowed status codes
    if (!validErrorStatus) {
      ;(err as any).statusCode = 400
    }
    throw err
  }
}
