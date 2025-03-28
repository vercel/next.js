/* global __NEXT_DATA__ */
import { createElement, startTransition } from "react";
import mitt from "mitt";
import { waitForPage } from "../lib/page-loader";
import router, { createRouter } from "./router";
import { getURL } from "../lib/url";
import { hydrateRoot } from "react-dom/client";

const { props, err, pathname, query } = __NEXT_DATA__;

__webpack_public_path__ = __NEXT_DATA__.publicPath; // eslint-disable-line

const asPath = getURL();

const appContainer = document.getElementById("__next");

let lastAppProps;
let ErrorComponent;
let reactRoot = null;

export const emitter = mitt();

let Enhancer;
export function setEnhancer(_enhancer) {
  Enhancer = _enhancer;
}

export default () => {
  return Promise.all([
    waitForPage("/_error"),
    waitForPage(pathname).catch(console.error),
  ]).then(([_ErrorComponent, Component]) => {
    console.log("clinent/index.js error component");
    ErrorComponent = _ErrorComponent;
    Component = Component || ErrorComponent;

    createRouter(
      pathname,
      query,
      asPath,
      {
        Component,
        err,
      },
      render
    );

    render({ Component, props, err });

    return emitter;
  });
};

export function render({ Component, props, err }) {
  // There are some errors we should ignore.
  // Next.js rendering logic knows how to handle them.
  // These are specially 404 errors
  if (err && !err.ignore) {
    return renderError(err);
  }

  let loadProps;
  if (
    !props &&
    Component &&
    Component !== ErrorComponent &&
    lastAppProps.Component === ErrorComponent
  ) {
    // fetch props if ErrorComponent was replaced with a page component by HMR
    const { pathname, query, asPath } = router.url;
    loadProps = Component.getInitialProps({ err, pathname, query, asPath });
  } else {
    loadProps = Promise.resolve(props);
  }

  return loadProps
    .then((props) => {
      Component = Component || lastAppProps.Component;
      props = props || lastAppProps.props;

      const appProps = { Component, props, err, router };
      // lastAppProps has to be set before ReactDom.render to account for ReactDom throwing an error.
      lastAppProps = appProps;

      emitter.emit("before-reactdom-render", {
        Component,
        ErrorComponent,
        appProps,
      });
      renderReactElement(
        createElement(Component, { url: router.url, ...props }),
        appContainer
      );
      emitter.emit("after-reactdom-render", {
        Component,
        ErrorComponent,
        appProps,
      });
    })
    .catch((err) => {
      if (err.abort) return;
      return renderError(err);
    });
}

// This method handles all runtime and debug errors.
// 404 and 500 errors are special kind of errors
// and they are still handle via the main render method.
export function renderError(error) {
  return ErrorComponent.getInitialProps({
    err: error,
    pathname,
    query,
    asPath,
  }).then((props) => {
    const appProps = { Component: ErrorComponent, props, err: error, router };
    emitter.emit("before-reactdom-render", { ErrorComponent, appProps });
    renderReactElement(createElement(ErrorComponent, props), appContainer);
    emitter.emit("after-reactdom-render", { ErrorComponent, appProps });
  });
}

// This method is responsible for rending react elements in the DOM.
// If the root has not been defined yet, it will hydrate the element.
// If the root has already been defined, it will use startTransition to update the tree.
function renderReactElement(reactEl, domEl) {
  // Wrap page in app-level enhancer, if defined
  reactEl = Enhancer ? createElement(Enhancer, null, reactEl) : reactEl;

  if (!reactRoot) {
    reactRoot = hydrateRoot(domEl, reactEl);
  } else {
    startTransition(() => {
      reactRoot.render(reactEl);
    });
  }
}
