const END_OF_OPERATION = process.argv[2];

import App from "@vercel/turbopack-next/pages/_app";
import Document from "@vercel/turbopack-next/pages/_document";
import { HtmlContext } from "@vercel/turbopack-next/internal/html-context";
import { loadGetInitialProps } from "@vercel/turbopack-next/internal/shared-utils";
import Component, * as otherExports from ".";
import { renderToString, renderToStaticMarkup } from "react-dom/server";
("TURBOPACK { transition: next-client }");
import chunkGroup from ".";

process.stdout.write("READY\n");

const NEW_LINE = "\n".charCodeAt(0);
let buffer = [];
process.stdin.on("data", async (data) => {
  let idx = data.indexOf(NEW_LINE);
  while (idx >= 0) {
    buffer.push(data.slice(0, idx));
    try {
      let json = JSON.parse(Buffer.concat(buffer).toString("utf-8"));
      buffer.length = 0;
      let result = await operation(json);
      console.log(`RESULT=${JSON.stringify(result)}`);
    } catch (e) {
      console.log(`ERROR=${JSON.stringify(e.stack)}`);
    }
    console.log(END_OF_OPERATION);
    data = data.slice(idx + 1);
    idx = data.indexOf(NEW_LINE);
  }
  buffer.push(data);
});

const DOCTYPE = "<!DOCTYPE html>";

function Body({ children }) {
  return <div id="__next">{children}</div>;
}

async function operation(renderData) {
  let data;
  if ("getStaticProps" in otherExports) {
    // TODO(alexkirsz) Pass in `context` as defined in
    // https://nextjs.org/docs/api-reference/data-fetching/get-static-props#context-parameter
    data = otherExports.getStaticProps({
      params: renderData.params,
    });
    if ("then" in data) {
      data = await data;
    }
  } else if ("getServerSideProps" in otherExports) {
    data = otherExports.getServerSideProps({
      params: renderData.params,
      query: { ...renderData.query, ...renderData.params },
      req: {
        headers: renderData.headers,
        // TODO add `cookies` field
      },
      method: renderData.method,
      url: renderData.url,
    });
  } else {
    data = { props: {} };
  }

  const initialProps = await loadGetInitialProps(App, {
    Component,
    // TODO(alexkirsz) Pass in `context`
    ctx: {},
  });
  const props = { ...initialProps, ...data.props, pageProps: { ...initialProps.pageProps, ...data.props } };

  const urls = chunkGroup.map((p) => `/${p}`);
  const scripts = urls.filter((url) => url.endsWith(".js"));
  const styles = urls.filter((url) => url.endsWith(".css"));
  const htmlProps = {
    scripts,
    styles,
    __NEXT_DATA__: { props },
  };

  const documentHTML = renderToStaticMarkup(
    <HtmlContext.Provider value={htmlProps}>
      <Document />
    </HtmlContext.Provider>
  );

  const [renderTargetPrefix, renderTargetSuffix] = documentHTML.split(
    "<next-js-internal-body-render-target></next-js-internal-body-render-target>"
  );

  const result = [];
  if (!documentHTML.startsWith(DOCTYPE)) {
    result.push(DOCTYPE);
  }
  result.push(renderTargetPrefix);

  result.push(
    // TODO capture meta info during rendering
    renderToString(
      <Body>
        <App {...props} Component={Component} />
      </Body>
    )
  );
  result.push(renderTargetSuffix);

  return result.join("");
}
