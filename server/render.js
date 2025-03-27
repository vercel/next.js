import { join } from "path";
import { createElement } from "react";
import { renderToString, renderToStaticMarkup } from "react-dom/server";
import stripAnsi from "strip-ansi";
import Head, { defaultHead } from "../lib/head";

export const $HEAD = Symbol.for("head");

export async function doPageRender(
  req,
  res,
  pathname,
  query,
  initialProps,
  {
    dev,
    err,
    publicPath,
    page,
    hotReloader,
    dir,
    overloadCheck = () => false,
    enhancer = (Page) => Page,
  }
) {
  pathname = pathname.replace(/\/index/, "") || "/index";
  page = page || pathname;

  await ensurePage(page, { dir, hotReloader });

  const pageDir = join(dir, ".next", "server", "pages");

  let Component = require(join(pageDir, page));
  Component = Component.default || Component;

  const asPath = req.url;
  const props =
    initialProps ||
    (await Component.getInitialProps({
      err,
      req,
      res,
      pathname,
      query,
      asPath,
    }));

  if (overloadCheck()) {
    return {
      pathname,
      query,
      props,
      head: props[$HEAD] || renderToString(defaultHead),
    };
  }

  const app = createElement(enhancer(Component), { url: asPath, ...props });

  let html;
  let head;
  let errorHtml;

  try {
    if (err) {
      console.log("render.js error", err);
      errorHtml = renderToString(app);
    } else {
      html = renderToString(app);
    }
  } finally {
    head = props[$HEAD] || renderToString(Head.rewind() || defaultHead);
  }

  console.log("before serialize erorr render.js");
  return {
    err: serializeError(dev, err),
    pathname,
    query,
    props,
    head,
    html,
    publicPath,
    errorHtml,
  };
}

export async function doDocRender(
  page,
  initialProps,
  { amp, dev, dir, publicPath, entrypoints, hotReloader, buildId }
) {
  const pageDir = join(dir, ".next", "server", "pages");

  let Document = require(join(pageDir, amp ? "_amp" : "_document"));
  Document = Document.default || Document;

  const docProps = await Document.getInitialProps({
    initialProps,
    renderPage: () => page,
  });
  const doc = createElement(Document, {
    __NEXT_DATA__: {
      buildId,
      props: docProps.props,
      pathname: docProps.pathname,
      query: docProps.query,
      publicPath: docProps.publicPath || publicPath,
      err: docProps.err,
    },
    entrypoints:
      entrypoints ||
      hotReloader.multiStats.stats.reduce((prev, { compilation }) => {
        for (let [entryName, entrypoint] of compilation.entrypoints.entries()) {
          const path =
            (prev[entryName] =
            prev[entryName] =
              prev[entryName] || { chunks: [] });
          path.chunks.push(
            ...entrypoint.chunks
              .reduce((prev, { files }) => prev.concat(files), [])
              .filter(
                (name) => !/\.map$/.test(name) && !/hot-update.js/.test(name)
              )
              .map((file) => ({
                file,
                module: !/-legacy\.js/.test(file),
              }))
          );
        }
        return prev;
      }, {}),
    dev,
    ...docProps,
  });

  return "<!DOCTYPE html>" + renderToStaticMarkup(doc);
}

export function serializeError(dev, err) {
  if (!err) {
    return undefined;
  }
  if (err.output && err.output.payload) {
    return err.output.payload;
  }
  if (err.status) {
    return { name: err.name, message: err.message, status: err.status };
  }
  if (dev) {
    const { name, message, stack } = err;
    const json = { name, message: stripAnsi(message), stack: stripAnsi(stack) };

    if (err.module) {
      // rawRequest contains the filename of the module which has the error.
      const { rawRequest } = err.module;
      json.module = { rawRequest };
    }

    return json;
  }

  return { message: "500 - Internal Server Error." };
}

async function ensurePage(page, { dir, hotReloader }) {
  if (!hotReloader) return;
  if (page === "_error" || page === "_document" || page === "_amp") return;

  await hotReloader.ensurePage(page);
}
