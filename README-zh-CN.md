<img width="112" alt="screen shot 2016-10-25 at 2 37 27 pm" src="https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png">

[![NPM version](https://img.shields.io/npm/v/next.svg)](https://www.npmjs.com/package/next)
[![Build Status](https://travis-ci.org/zeit/next.js.svg?branch=master)](https://travis-ci.org/zeit/next.js)
[![Build status](https://ci.appveyor.com/api/projects/status/gqp5hs71l3ebtx1r/branch/master?svg=true)](https://ci.appveyor.com/project/arunoda/next-js/branch/master)
[![Coverage Status](https://coveralls.io/repos/zeit/next.js/badge.svg?branch=master)](https://coveralls.io/r/zeit/next.js?branch=master)
[![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/next-js)

Next.js 是一个轻量级的 React 服务端渲染应用框架。

**可访问 [nextjs.org/learn](https://nextjs.org/learn) 开始学习 Next.js.**

[README in English](README.md)

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
<!-- https://github.com/thlorenz/doctoc -->

- [怎么使用](#how-to-use)
  - [安装](#setup)
  - [代码自动分割](#automatic-code-splitting)
  - [CSS](#css)
    - [支持嵌入样式](#built-in-css-support)
    - [内嵌样式](#css-in-js)
    - [使用 CSS / Sass / Less / Stylus files](#importing-css--sass--less--stylus-files)
  - [静态文件服务（如图像)](#static-file-serving-eg-images)
  - [`<head>`](#populating-head)
  - [获取数据以及组件生命周期](#fetching-data-and-component-lifecycle)
  - [路由](#routing)
    - [`<Link>` 用法](#with-link)
      - [URL 对象](#with-url-object)
      - [替换路由](#replace-instead-of-push-url)
      - [组件支持点击事件`onClick`](#using-a-component-that-supports-onclick)
      - [暴露`href`给子元素](#forcing-the-link-to-expose-href-to-its-child)
      - [禁止滚动到页面顶部](#disabling-the-scroll-changes-to-top-on-page)
    - [命令式](#imperatively)
    - [拦截器 `popstate`](#intercepting-popstate)
      - [URL 对象用法](#with-url-object-1)
      - [路由事件](#router-events)
      - [浅层路由](#shallow-routing)
    - [高阶组件](#using-a-higher-order-component)
  - [预加载页面](#prefetching-pages)
    - [`<Link>`用法](#with-link-1)
    - [命令式 prefetch 写法](#imperatively-1)
  - [自定义服务端路由](#custom-server-and-routing)
    - [禁止文件路由](#disabling-file-system-routing)
    - [动态前缀](#dynamic-assetprefix)
  - [动态导入](#dynamic-import)
    - [1. 基础支持 (同样支持 SSR)](#1-basic-usage-also-does-ssr)
    - [2. 自定义加载组件](#2-with-custom-loading-component)
    - [3. 禁止使用 SSR](#3-with-no-ssr)
    - [4. 同时加载多个模块](#4-with-multiple-modules-at-once)
  - [自定义 `<App>`](#custom-app)
  - [自定义 `<Document>`](#custom-document)
  - [自定义错误处理](#custom-error-handling)
  - [渲染内置错误页面](#reusing-the-built-in-error-page)
  - [自定义配置](#custom-configuration)
    - [设置自定义构建目录](#setting-a-custom-build-directory)
    - [禁止 etag 生成](#disabling-etag-generation)
    - [配置 onDemandEntries](#configuring-the-ondemandentries)
    - [配置页面后缀名解析扩展](#configuring-extensions-looked-for-when-resolving-pages-in-pages)
    - [配置构建 ID](#configuring-the-build-id)
  - [自定义 webpack 配置](#customizing-webpack-config)
  - [自定义 babel 配置](#customizing-babel-config)
  - [暴露配置到服务端和客户端](#exposing-configuration-to-the-server--client-side)
  - [启动服务选择 hostname](#starting-the-server-on-alternative-hostname)
  - [CDN 支持前缀](#cdn-support-with-asset-prefix)
- [项目部署](#production-deployment)
- [浏览器支持](#browser-support)
- [导出静态页面](#static-html-export)
  - [使用](#usage)
  - [限制](#limitation)
- [多 zone](#multi-zones)
  - [怎么定义一个 zone](#how-to-define-a-zone)
  - [怎么合并他们](#how-to-merge-them)
- [技巧](#recipes)
- [FAQ](#faq)
- [贡献](#contributing)
- [作者](#authors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

<a id="how-to-use" style="display: none"></a>

## 怎么使用

<a id="setup" style="display: none"></a>

### 安装

安装它:

```bash
npm install --save next react react-dom
```

将下面脚本添加到 package.json 中:

```json
{
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
  }
}
```

下面, 文件系统是主要的 API. 每个`.js` 文件将变成一个路由，自动处理和渲染。

新建 `./pages/index.js` 到你的项目中:

```jsx
export default () => <div>Welcome to next.js!</div>;
```

运行 `npm run dev` 命令并打开 `http://localhost:3000`。 如果你想使用其他端口，可运行 `npm run dev -- -p <设置端口号>`.

目前为止我们可以了解到:

- 自动打包编译 (使用 webpack 和 babel)
- 热加载
- 以 `./pages`作为服务端的渲染和索引
- Static file serving. `./static/` is mapped to `/static/` (given you [create a `./static/` directory](#static-file-serving-eg-images) inside your project)
- 静态文件服务. `./static/` 映射到 `/static/` (可以 [创建一个静态目录](#static-file-serving-eg-images) 在你的项目中)

这里有个简单的案例，可以下载看看 [sample app - nextgram](https://github.com/zeit/nextgram)

<a id="automatic-code-splitting" style="display: none"></a>

### 代码自动分割

每个页面只会导入`import`中绑定以及被用到的代码. 也就是说并不会加载不需要的代码!

```jsx
import cowsay from "cowsay-browser";

export default () => <pre>{cowsay.say({ text: "hi there!" })}</pre>;
```

<a id="css" style="display: none"></a>

### CSS

<a id="built-in-css-support" style="display: none"></a>

#### 支持嵌入样式

<p><details>
  <summary><b>案例</b></summary>
  <ul><li><a href="https://github.com/zeit/next.js/tree/canary/examples/basic-css">Basic css</a></li></ul>
</details></p>

我们绑定 [styled-jsx](https://github.com/zeit/styled-jsx) 来生成独立作用域的 CSS. 目标是支持 "shadow CSS",但是 [不支持独立模块作用域的 JS](https://github.com/w3c/webcomponents/issues/71).

```jsx
export default () => (
  <div>
    Hello world
    <p>scoped!</p>
    <style jsx>{`
      p {
        color: blue;
      }
      div {
        background: red;
      }
      @media (max-width: 600px) {
        div {
          background: blue;
        }
      }
    `}</style>
    <style global jsx>{`
      body {
        background: black;
      }
    `}</style>
  </div>
);
```

想查看更多案例可以点击 [styled-jsx documentation](https://www.npmjs.com/package/styled-jsx)查看.

<a id="css-in-js" style="display: none"></a>

#### 内嵌样式

<p><details>
  <summary>
    <b>Examples</b>
    </summary>
  <ul><li><a href="./examples/with-styled-components">Styled components</a></li><li><a href="./examples/with-styletron">Styletron</a></li><li><a href="./examples/with-glamor">Glamor</a></li><li><a href="./examples/with-glamorous">Glamorous</a></li><li><a href="./examples/with-cxs">Cxs</a></li><li><a href="./examples/with-aphrodite">Aphrodite</a></li><li><a href="./examples/with-fela">Fela</a></li></ul>
</details></p>

有些情况可以使用 CSS 内嵌 JS 写法。如下所示：

```jsx
export default () => <p style={{ color: "red" }}>hi there</p>;
```

更复杂的内嵌样式解决方案，特别是服务端渲染的时样式更改。我们可以通过包裹自定义 Document，来添加样式，案例如下：[custom `<Document>`](#user-content-custom-document)

<a id="importing-css--sass--less--stylus-files" style="display: none"></a>

#### 使用 CSS / Sass / Less / Stylus files

支持用`.css`, `.scss`, `.less` or `.styl`，需要配置默认文件 next.config.js，具体可查看下面链接

- [@zeit/next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css)
- [@zeit/next-sass](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
- [@zeit/next-less](https://github.com/zeit/next-plugins/tree/master/packages/next-less)
- [@zeit/next-stylus](https://github.com/zeit/next-plugins/tree/master/packages/next-stylus)

<a id="static-file-serving-eg-images" style="display: none"></a>

### 静态文件服务（如图像）

在根目录下新建文件夹叫`static`。代码可以通过`/static/`来引入相关的静态资源。

```jsx
export default () => <img src="/static/my-image.png" alt="my image" />;
```

\_注意：不要自定义静态文件夹的名字，只能叫`static` ，因为只有这个名字 Next.js 才会把它当作静态资源。

<a id="populating-head" style="display: none"></a>

### 生成`<head>`

`<head>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/head-elements">Head elements</a></li>
    <li><a href="./examples/layout-component">Layout component</a></li>
  </ul>
</details></p>

我们设置一个内置组件来装载`<head>`到页面中。

```jsx
import Head from "next/head";

export default () => (
  <div>
    <Head>
      <title>My page title</title>
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <p>Hello world!</p>
  </div>
);
```

我们定义`key`属性来避免重复的`<head>`标签，保证`<head>`只渲染一次，如下所示：

```jsx
import Head from "next/head";
export default () => (
  <div>
    <Head>
      <title>My page title</title>
      <meta
        name="viewport"
        content="initial-scale=1.0, width=device-width"
        key="viewport"
      />
    </Head>
    <Head>
      <meta
        name="viewport"
        content="initial-scale=1.2, width=device-width"
        key="viewport"
      />
    </Head>
    <p>Hello world!</p>
  </div>
);
```

只有第二个`<meta name="viewport" />`才被渲染。

注意：在卸载组件时，`<head>`的内容将被清除。请确保每个页面都在其`<head>`定义了所需要的内容，而不是假设其他页面已经加过了

<a id="fetching-data-and-component-lifecycle" style="display: none"></a>

### 获取数据以及组件生命周期

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/data-fetch">Data fetch</a></li></ul>
</details></p>

如果你需要一个有状态、生命周期或有初始数据的 React 组件（而不是上面的无状态函数），如下所示：

```jsx
import React from "react";

export default class extends React.Component {
  static async getInitialProps({ req }) {
    const userAgent = req ? req.headers["user-agent"] : navigator.userAgent;
    return { userAgent };
  }

  render() {
    return <div>Hello World {this.props.userAgent}</div>;
  }
}
```

相信你注意到，当页面渲染时加载数据，我们使用了一个异步方法`getInitialProps`。它能异步获取 JS 普通对象，并绑定在`props`上

当服务渲染时，`getInitialProps`将会把数据序列化，就像`JSON.stringify`。所以确保`getInitialProps`返回的是一个普通 JS 对象，而不是`Date`, `Map` 或 `Set`类型。

当页面初次加载时，`getInitialProps`只会在服务端执行一次。`getInitialProps`只有在路由切换的时候（如`Link`组件跳转或路由自定义跳转）时，客户端的才会被执行。

当页面初始化加载时，`getInitialProps`只会加载在服务端。只有当路由跳转（`Link`组件跳转或 API 方法跳转）时，客户端才会执行`getInitialProps`。

注意：`getInitialProps`将不能使用在子组件中。只能使用在`pages`页面中。

<br/>

> 只有服务端用到的模块放在`getInitialProps`里，请确保正确的导入了它们，可参考[import them properly](https://arunoda.me/blog/ssr-and-server-only-modules)。
> 否则会拖慢你的应用速度。

<br/>

你也可以给无状态组件定义`getInitialProps`：

```jsx
const Page = ({ stars }) => <div>Next stars: {stars}</div>;

Page.getInitialProps = async ({ req }) => {
  const res = await fetch("https://api.github.com/repos/zeit/next.js");
  const json = await res.json();
  return { stars: json.stargazers_count };
};

export default Page;
```

`getInitialProps`入参对象的属性如下：

- `pathname` - URL 的 path 部分
- `query` - URL 的 query 部分，并被解析成对象
- `asPath` - 显示在浏览器中的实际路径（包含查询部分），为`String`类型
- `req` - HTTP 请求对象 (只有服务器端有)
- `res` - HTTP 返回对象 (只有服务器端有)
- `err` - 渲染过程中的任何错误

<a id="routing" style="display: none"></a>

### 路由

<a id="with-link" style="display: none"></a>

#### `<Link>`用法

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/hello-world">Hello World</a></li>
  </ul>
</details></p>

可以用 `<Link>` 组件实现客户端的路由切换。

```jsx
// pages/index.js
import Link from "next/link";

export default () => (
  <div>
    Click{" "}
    <Link href="/about">
      <a>here</a>
    </Link>{" "}
    to read more
  </div>
);
```

```jsx
// pages/about.js
export default () => <p>Welcome to About!</p>;
```

注意：可以使用[`<Link prefetch>`](#prefetching-pages)使链接和预加载在后台同时进行，来达到页面的最佳性能。

客户端路由行为与浏览器很相似：

1. 组件获取
2. 如果组件定义了`getInitialProps`，数据获取了。如果有错误情况将会渲染 `_error.js`。
3. 1 和 2 都完成了，`pushState`执行，新组件被渲染。

如果需要注入`pathname`, `query` 或 `asPath`到你组件中，你可以使用[withRouter](#using-a-higher-order-component)。

<a id="with-url-object" style="display: none"></a>

##### URL 对象

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-url-object-routing">With URL Object Routing</a></li>
  </ul>
</details></p>

组件`<Link>`接收 URL 对象，而且它会自动格式化生成 URL 字符串

```jsx
// pages/index.js
import Link from "next/link";

export default () => (
  <div>
    Click{" "}
    <Link href={{ pathname: "/about", query: { name: "Zeit" } }}>
      <a>here</a>
    </Link>{" "}
    to read more
  </div>
);
```

将生成 URL 字符串`/about?name=Zeit`，你可以使用任何在[Node.js URL module documentation](https://nodejs.org/api/url.html#url_url_strings_and_url_objects)定义过的属性。

<a id="replace-instead-of-push-url" style="display: none"></a>

##### 替换路由

`<Link>`组件默认将新 url 推入路由栈中。你可以使用`replace`属性来防止添加新输入。

```jsx
// pages/index.js
import Link from "next/link";

export default () => (
  <div>
    Click{" "}
    <Link href="/about" replace>
      <a>here</a>
    </Link>{" "}
    to read more
  </div>
);
```

<a id="using-a-component-that-supports-onclick" style="display: none"></a>

##### 组件支持点击事件 `onClick`

`<Link>`支持每个组件所支持的`onClick`事件。如果你不提供`<a>`标签，只会处理`onClick`事件而`href`将不起作用。

```jsx
// pages/index.js
import Link from "next/link";

export default () => (
  <div>
    Click{" "}
    <Link href="/about">
      <img src="/static/image.png" alt="image" />
    </Link>
  </div>
);
```

<a id="forcing-the-link-to-expose-href-to-its-child" style="display: none"></a>

##### 暴露 `href` 给子元素

如子元素是一个没有 href 属性的`<a>`标签，我们将会指定它以免用户重复操作。然而有些时候，我们需要里面有`<a>`标签，但是`Link`组件不会被识别成*超链接*，结果不能将`href`传递给子元素。在这种场景下，你可以定义一个`Link`组件中的布尔属性`passHref`，强制将`href`传递给子元素。

**注意**: 使用`a`之外的标签而且没有通过`passHref`的链接可能会使导航看上去正确，但是当搜索引擎爬行检测时，将不会识别成链接（由于缺乏 href 属性），这会对你网站的 SEO 产生负面影响。

```jsx
import Link from "next/link";
import Unexpected_A from "third-library";

export default ({ href, name }) => (
  <Link href={href} passHref>
    <Unexpected_A>{name}</Unexpected_A>
  </Link>
);
```

<a id="disabling-the-scroll-changes-to-top-on-page" style="display: none"></a>

##### 禁止滚动到页面顶部

`<Link>`的默认行为就是滚到页面顶部。当有 hash 定义时（＃），页面将会滚动到对应的 id 上，就像`<a>`标签一样。为了预防滚动到顶部，可以给`<Link>`加
`scroll={false}`属性：

```jsx
<Link scroll={false} href="/?counter=10"><a>Disables scrolling</a></Link>
<Link href="/?counter=10"><a>Changes with scrolling to top</a></Link>
```

<a id="imperatively" style="display: none"></a>

#### 命令式

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/using-router">Basic routing</a></li>
    <li><a href="./examples/with-loading">With a page loading indicator</a></li>
  </ul>
</details></p>

你也可以用`next/router`实现客户端路由切换

```jsx
import Router from "next/router";

export default () => (
  <div>
    Click <span onClick={() => Router.push("/about")}>here</span> to read more
  </div>
);
```

<a id="intercepting-popstate" style="display: none"></a>

#### 拦截器 `popstate`

有些情况（比如使用[custom router](#custom-server-and-routing)），你可能想监听[`popstate`](https://developer.mozilla.org/en-US/docs/Web/Events/popstate)，在路由跳转前做一些动作。
比如，你可以操作 request 或强制 SSR 刷新

```jsx
import Router from "next/router";

Router.beforePopState(({ url, as, options }) => {
  // I only want to allow these two routes!
  if (as !== "/" || as !== "/other") {
    // Have SSR render bad routes as a 404.
    window.location.href = as;
    return false;
  }

  return true;
});
```

如果你在`beforePopState`中返回 false，`Router`将不会执行`popstate`事件。
例如[Disabling File-System Routing](#disabling-file-system-routing)。

以上`Router`对象的 API 如下：

- `route` - 当前路由的`String`类型
- `pathname` - 不包含查询内容的当前路径，为`String`类型
- `query` - 查询内容，被解析成`Object`类型. 默认为`{}`
- `asPath` - 展现在浏览器上的实际路径，包含查询内容，为`String`类型
- `push(url, as=url)` - 页面渲染第一个参数 url 的页面，浏览器栏显示的是第二个参数 url
- `replace(url, as=url)` - performs a `replaceState` call with the given url
- `beforePopState(cb=function)` - 在路由器处理事件之前拦截.

`push` 和 `replace` 函数的第二个参数`as`，是为了装饰 URL 作用。如果你在服务器端设置了自定义路由将会起作用。

<a id="with-url-object-1" style="display: none"></a>

##### URL 对象用法

`push` 或 `replace`可接收的 URL 对象（`<Link>`组件的 URL 对象一样）来生成 URL。

```jsx
import Router from "next/router";

const handler = () =>
  Router.push({
    pathname: "/about",
    query: { name: "Zeit" }
  });

export default () => (
  <div>
    Click <span onClick={handler}>here</span> to read more
  </div>
);
```

也可以像`<Link>`组件一样添加额外的参数。

<a id="router-events" style="display: none"></a>

##### 路由事件

你可以监听路由相关事件。
下面是事件支持列表：

- `routeChangeStart(url)` - 路由开始切换时触发
- `routeChangeComplete(url)` - 完成路由切换时触发
- `routeChangeError(err, url)` - 路由切换报错时触发
- `beforeHistoryChange(url)` - 浏览器 history 模式开始切换时触发
- `hashChangeStart(url)` - 开始切换 hash 值但是没有切换页面路由时触发
- `hashChangeComplete(url)` - 完成切换 hash 值但是没有切换页面路由时触发

> 这里的`url`是指显示在浏览器中的 url。如果你用了`Router.push(url, as)`（或类似的方法），那浏览器中的 url 将会显示 as 的值。

下面是如何正确使用路由事件`routeChangeStart`的例子：

```js
const handleRouteChange = url => {
  console.log("App is changing to: ", url);
};

Router.events.on("routeChangeStart", handleRouteChange);
```

如果你不想长期监听该事件，你可以用`off`事件去取消监听：

```js
Router.events.off("routeChangeStart", handleRouteChange);
```

如果路由加载被取消（比如快速连续双击链接）

```js
Router.events.on("routeChangeError", (err, url) => {
  if (err.cancelled) {
    console.log(`Route to ${url} was cancelled!`);
  }
});
```

<a id="shallow-routing" style="display: none"></a>

##### 浅层路由

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-shallow-routing">Shallow Routing</a></li>
  </ul>
</details></p>

浅层路由允许你改变 URL 但是不执行`getInitialProps`生命周期。你可以加载相同页面的 URL，得到更新后的路由属性`pathname`和`query`，并不失去 state 状态。

你可以给`Router.push` 或 `Router.replace`方法加`shallow: true`参数。如下面的例子所示：

```js
// Current URL is "/"
const href = "/?counter=10";
const as = href;
Router.push(href, as, { shallow: true });
```

现在 URL 更新为`/?counter=10`。在组件里查看`this.props.router.query`你将会看到更新的 URL。

你可以在[`componentdidupdate`](https://facebook.github.io/react/docs/react-component.html#componentdidupdate)钩子函数中监听 URL 的变化。

```js
componentDidUpdate(prevProps) {
  const { pathname, query } = this.props.router
  // verify props have changed to avoid an infinite loop
  if (query.id !== prevProps.router.query.id) {
    // fetch data based on the new query
  }
}
```

> 注意:
>
> 浅层路由只作用于相同 URL 的参数改变，比如我们假定有个其他路由`about`，而你向下面代码样运行:
>
> ```js
> Router.push("/?counter=10", "/about?counter=10", { shallow: true });
> ```
>
> 那么这将会出现新页面，即使我们加了浅层路由，但是它还是会卸载当前页，会加载新的页面并触发新页面的`getInitialProps`。

<a id="using-a-higher-order-component" style="display: none"></a>

#### 高阶组件

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/using-with-router">Using the `withRouter` utility</a></li>
  </ul>
</details></p>

如果你想应用里每个组件都处理路由对象，你可以使用`withRouter`高阶组件。下面是如何使用它：

```jsx
import { withRouter } from "next/router";

const ActiveLink = ({ children, router, href }) => {
  const style = {
    marginRight: 10,
    color: router.pathname === href ? "red" : "black"
  };

  const handleClick = e => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <a href={href} onClick={handleClick} style={style}>
      {children}
    </a>
  );
};

export default withRouter(ActiveLink);
```

上面路由对象的 API 可以参考[`next/router`](#imperatively).

<a id="prefetching-pages" style="display: none"></a>

### 预加载页面

⚠️ 只有生产环境才有此功能 ⚠️

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-prefetching">Prefetching</a></li></ul>
</details></p>

Next.js 有允许你预加载页面的 API。

用 Next.js 服务端渲染你的页面，可以达到所有你应用里所有未来会跳转的路径即时响应，有效的应用 Next.js，可以通过预加载应用程序的功能，最大程度的初始化网站性能。[查看更多](https://zeit.co/blog/next#anticipation-is-the-key-to-performance).

> Next.js 的预加载功能只预加载 JS 代码。当页面渲染时，你可能需要等待数据请求。

<a id="with-link-1" style="display: none"></a>

#### `<Link>`用法

你可以给<Link>添加 `prefetch` 属性，Next.js 将会在后台预加载这些页面。

```jsx
import Link from "next/link";

// example header component
export default () => (
  <nav>
    <ul>
      <li>
        <Link prefetch href="/">
          <a>Home</a>
        </Link>
      </li>
      <li>
        <Link prefetch href="/about">
          <a>About</a>
        </Link>
      </li>
      <li>
        <Link prefetch href="/contact">
          <a>Contact</a>
        </Link>
      </li>
    </ul>
  </nav>
);
```

<a id="imperatively-1" style="display: none"></a>

#### 命令式 prefetch 写法

大多数预加载是通过<Link />处理的，但是我们还提供了命令式 API 用于更复杂的场景。

```jsx
import { withRouter } from "next/router";

export default withRouter(({ router }) => (
  <div>
    <a onClick={() => setTimeout(() => router.push("/dynamic"), 100)}>
      A route transition will happen after 100ms
    </a>
    {// but we can prefetch it!
    router.prefetch("/dynamic")}
  </div>
));
```

路由实例只允许在应用程序的客户端。以防服务端渲染发生错误，建议 prefetch 事件写在`componentDidMount()`生命周期里。

```jsx
import React from "react";
import { withRouter } from "next/router";

class MyLink extends React.Component {
  componentDidMount() {
    const { router } = this.props;
    router.prefetch("/dynamic");
  }

  render() {
    const { router } = this.props;
    return (
      <div>
        <a onClick={() => setTimeout(() => router.push("/dynamic"), 100)}>
          A route transition will happen after 100ms
        </a>
      </div>
    );
  }
}

export default withRouter(MyLink);
```

<a id="custom-server-and-routing" style="display: none"></a>

### 自定义服务端路由

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/custom-server">Basic custom server</a></li>
    <li><a href="./examples/custom-server-express">Express integration</a></li>
    <li><a href="./examples/custom-server-hapi">Hapi integration</a></li>
    <li><a href="./examples/custom-server-koa">Koa integration</a></li>
    <li><a href="./examples/parameterized-routing">Parameterized routing</a></li>
    <li><a href="./examples/ssr-caching">SSR caching</a></li>
  </ul>
</details></p>

一般你使用`next start`命令来启动 next 服务，你还可以编写代码来自定义路由，如使用路由正则等。

当使用自定义服务文件，如下面例子所示叫 server.js 时，确保你更新了 package.json 中的脚本。

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "next build",
    "start": "NODE_ENV=production node server.js"
  }
}
```

下面这个例子使 `/a` 路由解析为`./pages/b`，以及`/b` 路由解析为`./pages/a`;

```js
// This file doesn't go through babel or webpack transformation.
// Make sure the syntax and sources this file requires are compatible with the current node version you are running
// See https://github.com/zeit/next.js/issues/1245 for discussions on Universal Webpack or universal Babel
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true);
    const { pathname, query } = parsedUrl;

    if (pathname === "/a") {
      app.render(req, res, "/b", query);
    } else if (pathname === "/b") {
      app.render(req, res, "/a", query);
    } else {
      handle(req, res, parsedUrl);
    }
  }).listen(3000, err => {
    if (err) throw err;
    console.log("> Ready on http://localhost:3000");
  });
});
```

`next`的 API 如下所示

- `next(opts: object)`

opts 的属性如下:

- `dev` (`boolean`) 判断 Next.js 应用是否在开发环境 - 默认`false`
- `dir` (`string`) Next 项目路径 - 默认`'.'`
- `quiet` (`boolean`) 是否隐藏包含服务端消息在内的错误信息 - 默认`false`
- `conf` (`object`) 与`next.config.js`的对象相同 - 默认`{}`

生产环境的话，可以更改 package.json 里的`start`脚本为`NODE_ENV=production node server.js`。

<a id="disabling-file-system-routing" style="display: none"></a>

#### 禁止文件路由

默认情况，`Next`将会把`/pages`下的所有文件匹配路由（如`/pages/some-file.js` 渲染为 `site.com/some-file`）

如果你的项目使用自定义路由，那么有可能不同的路由会得到相同的内容，可以优化 SEO 和用户体验。

禁止路由链接到`/pages`下的文件，只需设置`next.config.js`文件如下所示：

```js
// next.config.js
module.exports = {
  useFileSystemPublicRoutes: false
};
```

注意`useFileSystemPublicRoutes`只禁止服务端的文件路由；但是客户端的还是禁止不了。

你如果想配置客户端路由不能跳转文件路由，可以参考[Intercepting `popstate`](#intercepting-popstate)。

<a id="dynamic-assetprefix" style="display: none"></a>

#### 动态前缀

有时你需要设置动态前缀，可以在请求时设置`assetPrefix`改变前缀。

使用方法如下：

```js
const next = require("next");
const micro = require("micro");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handleNextRequests = app.getRequestHandler();

app.prepare().then(() => {
  const server = micro((req, res) => {
    // Add assetPrefix support based on the hostname
    if (req.headers.host === "my-app.com") {
      app.setAssetPrefix("http://cdn.com/myapp");
    } else {
      app.setAssetPrefix("");
    }

    handleNextRequests(req, res);
  });

  server.listen(port, err => {
    if (err) {
      throw err;
    }

    console.log(`> Ready on http://localhost:${port}`);
  });
});
```

<a id="dynamic-import" style="display: none"></a>

### 动态导入

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-dynamic-import">With Dynamic Import</a></li>
  </ul>
</details></p>

ext.js 支持 JavaScript 的 TC39 提议[dynamic import proposal](https://github.com/tc39/proposal-dynamic-import)。你可以动态导入 JavaScript 模块（如 React 组件）。

动态导入相当于把代码分成各个块管理。Next.js 服务端动态导入功能，你可以做很多炫酷事情。

下面介绍一些动态导入方式：

<a id="1-basic-usage-also-does-ssr" style="display: none"></a>

#### 1. 基础支持 (同样支持 SSR)

```jsx
import dynamic from "next/dynamic";

const DynamicComponent = dynamic(import("../components/hello"));

export default () => (
  <div>
    <Header />
    <DynamicComponent />
    <p>HOME PAGE is here!</p>
  </div>
);
```

<a id="2-with-custom-loading-componen" style="display: none"></a>

#### 2. 自定义加载组件

```jsx
import dynamic from "next/dynamic";

const DynamicComponentWithCustomLoading = dynamic(
  import("../components/hello2"),
  {
    loading: () => <p>...</p>
  }
);

export default () => (
  <div>
    <Header />
    <DynamicComponentWithCustomLoading />
    <p>HOME PAGE is here!</p>
  </div>
);
```

<a id="3-with-no-ssr" style="display: none"></a>

#### 3. 禁止使用 SSR

```jsx
import dynamic from "next/dynamic";

const DynamicComponentWithNoSSR = dynamic(import("../components/hello3"), {
  ssr: false
});

export default () => (
  <div>
    <Header />
    <DynamicComponentWithNoSSR />
    <p>HOME PAGE is here!</p>
  </div>
);
```

<a id="4-with-multiple-modules-at-once" style="display: none"></a>

#### 4. 同时加载多个模块

```jsx
import dynamic from "next/dynamic";

const HelloBundle = dynamic({
  modules: () => {
    const components = {
      Hello1: import("../components/hello1"),
      Hello2: import("../components/hello2")
    };

    return components;
  },
  render: (props, { Hello1, Hello2 }) => (
    <div>
      <h1>{props.title}</h1>
      <Hello1 />
      <Hello2 />
    </div>
  )
});

export default () => <HelloBundle title="Dynamic Bundle" />;
```

<a id="custom-app" style="display: none"></a>

### 自定义 `<App>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-app-layout">Using `_app.js` for layout</a></li></ul>
  <ul><li><a href="./examples/with-componentdidcatch">Using `_app.js` to override `componentDidCatch`</a></li></ul>
</details></p>

组件来初始化页面。你可以重写它来控制页面初始化，如下面的事：

- 当页面变化时保持页面布局
- 当路由变化时保持页面状态
- 使用`componentDidCatch`自定义处理错误
- 注入额外数据到页面里 (如 GraphQL 查询)

重写的话，新建`./pages/_app.js`文件，重写 App 模块如下所示：

```js
import App, { Container } from "next/app";
import React from "react";

export default class MyApp extends App {
  static async getInitialProps({ Component, router, ctx }) {
    let pageProps = {};

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx);
    }

    return { pageProps };
  }

  render() {
    const { Component, pageProps } = this.props;
    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    );
  }
}
```

<a id="custom-document" style="display: none"></a>

### 自定义 `<Document>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-styled-components">Styled components custom document</a></li></ul>
  <ul><li><a href="./examples/with-amp">Google AMP</a></li></ul>
</details></p>

- 在服务端呈现
- 初始化服务端时添加文档标记元素
- 通常实现服务端渲染会使用一些 css-in-js 库，如[styled-components](./examples/with-styled-components), [glamorous](./examples/with-glamorous) 或 [emotion](with-emotion)。[styled-jsx](https://github.com/zeit/styled-jsx)是 Next.js 自带默认使用的 css-in-js 库

`Next.js`会自动定义文档标记，比如，你从来不需要添加`<html>`, `<body>`等。如果想自定义文档标记，你可以新建`./pages/_document.js`，然后扩展`Document`类：

```jsx
// _document is only rendered on the server side and not on the client side
// Event handlers like onClick can't be added to this file

// ./pages/_document.js
import Document, { Head, Main, NextScript } from "next/document";

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    return (
      <html>
        <Head>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body className="custom_class">
          <Main />
          <NextScript />
        </body>
      </html>
    );
  }
}
```

钩子[`getInitialProps`](#fetching-data-and-component-lifecycle)接收到的参数`ctx`对象都是一样的

- 回调函数`renderPage`是会执行 React 渲染逻辑的函数(同步)，这种做法有助于此函数支持一些类似于 Aphrodite 的 renderStatic 等一些服务器端渲染容器。

**注意：`<Main />`外的 React 组件将不会渲染到浏览器中，所以那添加应用逻辑代码。如果你页面需要公共组件（菜单或工具栏），可以参照上面说的`App`组件代替。**

<a id="custom-error-handling" style="display: none"></a>

### 自定义错误处理

404 和 500 错误客户端和服务端都会通过`error.js`组件处理。如果你想改写它，则新建`_error.js`在文件夹中：

```jsx
import React from "react";

export default class Error extends React.Component {
  static getInitialProps({ res, err }) {
    const statusCode = res ? res.statusCode : err ? err.statusCode : null;
    return { statusCode };
  }

  render() {
    return (
      <p>
        {this.props.statusCode
          ? `An error ${this.props.statusCode} occurred on server`
          : "An error occurred on client"}
      </p>
    );
  }
}
```

<a id="reusing-the-built-in-error-page" style="display: none"></a>

### 渲染内置错误页面

如果你想渲染内置错误页面，你可以使用`next/error`：

```jsx
import React from "react";
import Error from "next/error";
import fetch from "isomorphic-unfetch";

export default class Page extends React.Component {
  static async getInitialProps() {
    const res = await fetch("https://api.github.com/repos/zeit/next.js");
    const statusCode = res.statusCode > 200 ? res.statusCode : false;
    const json = await res.json();

    return { statusCode, stars: json.stargazers_count };
  }

  render() {
    if (this.props.statusCode) {
      return <Error statusCode={this.props.statusCode} />;
    }

    return <div>Next stars: {this.props.stars}</div>;
  }
}
```

> 如果你自定义了个错误页面，你可以引入自己的错误页面来代替`next/error`

<a id="custom-configuration" style="display: none"></a>

### 自定义配置

如果你想自定义 Next.js 的高级配置，可以在根目录下新建`next.config.js`文件（与`pages/` 和 `package.json`一起）

注意：`next.config.js`是一个 Node.js 模块，不是一个 JSON 文件，可以用于 Next 启动服务已经构建阶段，但是不作用于浏览器端。

```js
// next.config.js
module.exports = {
  /* config options here */
};
```

或使用一个函数：

```js
module.exports = (phase, { defaultConfig }) => {
  //
  // https://github.com/zeit/
  return {
    /* config options here */
  };
};
```

`phase`是配置文件被加载时的当前内容。你可看到所有的 phases 常量：[constants](./lib/constants.js)
这些常量可以通过`next/constants`引入：

```js
const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");
module.exports = (phase, { defaultConfig }) => {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      /* development only config options here */
    };
  }

  return {
    /* config options for all phases except development here */
  };
};
```

<a id="setting-a-custom-build-directory" style="display: none"></a>

#### 设置自定义构建目录

你可以自定义一个构建目录，如新建`build`文件夹来代替`.next` 文件夹成为构建目录。如果没有配置构建目录，构建时将会自动新建`.next`文件夹

```js
// next.config.js
module.exports = {
  distDir: "build"
};
```

<a id="disabling-etag-generation" style="display: none"></a>

#### 禁止 etag 生成

你可以禁止 etag 生成根据你的缓存策略。如果没有配置，Next 将会生成 etags 到每个页面中。

```js
// next.config.js
module.exports = {
  generateEtags: false
};
```

<a id="configuring-the-ondemandentries" style="display: none"></a>

#### 配置 onDemandEntries

Next 暴露一些选项来给你控制服务器部署以及缓存页面：

```js
module.exports = {
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2
  }
};
```

这个只是在开发环境才有的功能。如果你在生成环境中想缓存 SSR 页面，请查看[SSR-caching](https://github.com/zeit/next.js/tree/canary/examples/ssr-caching)

<a id="configuring-extensions-looked-for-when-resolving-pages-in-pages" style="display: none"></a>

#### 配置页面后缀名解析扩展

如 typescript 模块[`@zeit/next-typescript`](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript)，需要支持解析后缀名为`.ts`的文件。`pageExtensions` 允许你扩展后缀名来解析各种 pages 下的文件。

```js
// next.config.js
module.exports = {
  pageExtensions: ["jsx", "js"]
};
```

<a id="configuring-the-build-id" style="display: none"></a>

#### 配置构建 ID

Next.js 使用构建时生成的常量来标识你的应用服务是哪个版本。在每台服务器上运行构建命令时，可能会导致多服务器部署出现问题。为了保持同一个构建 ID，可以配置`generateBuildId`函数：

```js
// next.config.js
module.exports = {
  generateBuildId: async () => {
    // For example get the latest git commit hash here
    return "my-build-id";
  }
};
```

<a id="customizing-webpack-config" style="display: none"></a>

### 自定义 webpack 配置

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-webpack-bundle-analyzer">Custom webpack bundle analyzer</a></li></ul>
</details></p>

可以使用些一些常见的模块

- [@zeit/next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css)
- [@zeit/next-sass](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
- [@zeit/next-less](https://github.com/zeit/next-plugins/tree/master/packages/next-less)
- [@zeit/next-preact](https://github.com/zeit/next-plugins/tree/master/packages/next-preact)
- [@zeit/next-typescript](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript)

_注意： `webpack`方法将被执行两次，一次在服务端一次在客户端。你可以用`isServer`属性区分客户端和服务端来配置_

多配置可以组合在一起，如：

```js
const withTypescript = require("@zeit/next-typescript");
const withSass = require("@zeit/next-sass");

module.exports = withTypescript(
  withSass({
    webpack(config, options) {
      // Further custom configuration here
      return config;
    }
  })
);
```

为了扩展`webpack`使用，可以在`next.config.js`定义函数。

```js
// next.config.js is not transformed by Babel. So you can only use javascript features supported by your version of Node.js.

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Perform customizations to webpack config
    // Important: return the modified config
    return config;
  },
  webpackDevMiddleware: config => {
    // Perform customizations to webpack dev middleware config
    // Important: return the modified config
    return config;
  }
};
```

`webpack`的第二个参数是个对象，你可以自定义配置它，对象属性如下所示：

- `buildId` - 字符串类型，构建的唯一标示
- `dev` - `Boolean`型，判断你是否在开发环境下
- `isServer` - `Boolean` 型，为`true`使用在服务端, 为`false`使用在客户端.
- `defaultLoaders` - 对象型 ，内部加载器, 你可以如下配置
  - `babel` - 对象型，配置`babel-loader`.
  - `hotSelfAccept` - 对象型， `hot-self-accept-loader`配置选项.这个加载器只能用于高阶案例。如 [`@zeit/next-typescript`](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript)添加顶层 typescript 页面。

`defaultLoaders.babel`使用案例如下：

```js
// Example next.config.js for adding a loader that depends on babel-loader
// This source was taken from the @zeit/next-mdx plugin source:
// https://github.com/zeit/next-plugins/blob/master/packages/next-mdx
module.exports = {
  webpack: (config, {}) => {
    config.module.rules.push({
      test: /\.mdx/,
      use: [
        options.defaultLoaders.babel,
        {
          loader: "@mdx-js/loader",
          options: pluginOptions.options
        }
      ]
    });

    return config;
  }
};
```

<a id="customizing-babel-config" style="display: none"></a>

### 自定义 babel 配置

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-custom-babel-config">Custom babel configuration</a></li></ul>
</details></p>

为了扩展方便我们使用`babel`，可以在应用根目录新建`.babelrc`文件，该文件可配置。

如果有该文件，我们将会考虑数据源，因此也需要定义 next 项目需要的东西，也就是 `next/babel`预设。

这种设计方案将会使你不诧异于我们可以定制 babel 配置。

下面是`.babelrc`文件案例：

```json
{
  "presets": ["next/babel"],
  "plugins": []
}
```

`next/babel`预设可处理各种 React 应用所需要的情况。包括：

- preset-env
- preset-react
- plugin-proposal-class-properties
- plugin-proposal-object-rest-spread
- plugin-transform-runtime
- styled-jsx

presets / plugins 不允许添加到`.babelrc`中，然而你可以配置`next/babel`预设：

```json
{
  "presets": [
    [
      "next/babel",
      {
        "preset-env": {},
        "transform-runtime": {},
        "styled-jsx": {},
        "class-properties": {}
      }
    ]
  ],
  "plugins": []
}
```

`"preset-env"`模块选项应该保持为 false，否则 webpack 代码分割将被禁用。

<a id="exposing-configuration-to-the-server--client-side" style="display: none"></a>

### 暴露配置到服务端和客户端

`next/config`模块使你应用运行时可以读取些存储在`next.config.js`的配置项。`serverRuntimeConfig`属性只在服务器端可用，`publicRuntimeConfig`属性在服务端和客户端可用。

```js
// next.config.js
module.exports = {
  serverRuntimeConfig: {
    // Will only be available on the server side
    mySecret: "secret"
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    staticFolder: "/static",
    mySecret: process.env.MY_SECRET // Pass through env variables
  }
};
```

```js
// pages/index.js
import getConfig from "next/config";
// Only holds serverRuntimeConfig and publicRuntimeConfig from next.config.js nothing else.
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig();

console.log(serverRuntimeConfig.mySecret); // Will only be available on the server side
console.log(publicRuntimeConfig.staticFolder); // Will be available on both server and client

export default () => (
  <div>
    <img src={`${publicRuntimeConfig.staticFolder}/logo.png`} alt="logo" />
  </div>
);
```

<a id="starting-the-server-on-alternative-hostname" style="display: none"></a>

### 启动服务选择 hostname

启动开发环境服务可以设置不同的 hostname，你可以在启动命令后面加上`--hostname 主机名` 或 `-H 主机名`。它将会启动一个 TCP 服务器来监听连接所提供的主机。

<a id="cdn-support-with-asset-prefix" style="display: none"></a>

### CDN 支持前缀

建立一个 CDN，你能配置`assetPrefix`选项，去配置你的 CDN 源。

```js
const isProd = process.env.NODE_ENV === "production";
module.exports = {
  // You may only need to add assetPrefix in the production.
  assetPrefix: isProd ? "https://cdn.mydomain.com" : ""
};
```

注意：Next.js 运行时将会自动添加前缀，但是对于`/static`是没有效果的，如果你想这些静态资源也能使用 CDN，你需要自己添加前缀。有一个方法可以判断你的环境来加前缀，如 [in this example](https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration-build-time)。

<a id="production-deployment" style="display: none"></a>

## 项目部署

部署中，你可以先构建打包生成环境代码，再启动服务。因此，构建和启动分为下面两条命令：

```bash
next build
next start
```

例如，使用[`now`](https://zeit.co/now)去部署`package.json`配置文件如下：

```json
{
  "name": "my-app",
  "dependencies": {
    "next": "latest"
  },
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
  }
}
```

然后就可以直接运行`now`了。

Next.js 也有其他托管解决方案。请查考 wiki 章节['Deployment'](https://github.com/zeit/next.js/wiki/Deployment) 。

注意：`NODE_ENV`可以通过`next`命令配置，如果没有配置，会最大渲染，如果你使用编程式写法的话[programmatically](#custom-server-and-routing)，你需要手动设置`NODE_ENV=production`。

注意：推荐将`.next`或自定义打包文件夹[custom dist folder](https://github.com/zeit/next.js#custom-configuration)放入`.gitignore` 或 `.npmignore`中。否则，使用`files` 或 `now.files`
添加部署白名单，并排除`.next`或自定义打包文件夹。

<a id="browser-support" style="display: none"></a>

## 浏览器支持

Next.js 支持 IE11 和所有的现代浏览器使用了[`@babel/preset-env`](https://new.babeljs.io/docs/en/next/babel-preset-env.html)。为了支持 IE11，Next.js 需要全局添加`Promise`的 polyfill。有时你的代码或引入的其他 NPM 包的部分功能现代浏览器不支持，则需要用 polyfills 去实现。

ployflls 实现案例为[polyfills](https://github.com/zeit/next.js/tree/canary/examples/with-polyfills)。

<a id="static-html-export" style="display: none"></a>

## 导出静态页面

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-static-export">Static export</a></li></ul>
</details></p>

`next export`可以输出一个 Next.js 应用作为静态资源应用而不依靠 Node.js 服务。
这个输出的应用几乎支持 Next.js 的所有功能，包括动态路由，预获取，预加载以及动态导入。

`next export`将把所有有可能渲染出的 HTML 都生成。这是基于映射对象的`pathname`关键字关联到页面对象。这个映射叫做`exportPathMap`。

页面对象有 2 个属性:

- `page` - 字符串类型，页面生成目录
- `query` - 对象类型，当预渲染时，`query`对象将会传入页面的生命周期`getInitialProps`中。默认为`{}`。

<a id="usage" style="display: none"></a>

### 使用

通常开发 Next.js 应用你将会运行：

```
next build
next export
```

`next export`命令默认不需要任何配置，将会自动生成默认`exportPathMap`生成`pages`目录下的路由你页面。

如果你想动态配置路由，可以在`next.config.js`中添加异步函数`exportPathMap`。

```js
// next.config.js
module.exports = {
  exportPathMap: async function(defaultPathMap) {
    return {
      "/": { page: "/" },
      "/about": { page: "/about" },
      "/readme.md": { page: "/readme" },
      "/p/hello-nextjs": { page: "/post", query: { title: "hello-nextjs" } },
      "/p/learn-nextjs": { page: "/post", query: { title: "learn-nextjs" } },
      "/p/deploy-nextjs": { page: "/post", query: { title: "deploy-nextjs" } }
    };
  }
};
```

> 注意：如果 path 的结尾是目录名，则将导出`/dir-name/index.html`，但是如果结尾有扩展名，将会导出对应的文件，如上`/readme.md`。如果你使用`.html`以外的扩展名解析文件时，你需要设置 header 的`Content-Type`头为"text/html".

输入下面命令：

```sh
next build
next export
```

你可以在`package.json`添加一个 NPM 脚本，如下所示：

```json
{
  "scripts": {
    "build": "next build",
    "export": "npm run build && next export"
  }
}
```

接着只用执行一次下面命令：

```sh
npm run export
```

然后你将会有一个静态页面应用在`out` 目录下。

> 你也可以自定义输出目录。可以运行`next export -h`命令查看帮助。

现在你可以部署`out`目录到任意静态资源服务器上。注意如果部署 GitHub Pages 需要加个额外的步骤，[文档如下](https://github.com/zeit/next.js/wiki/Deploying-a-Next.js-app-into-GitHub-Pages)

例如，访问`out`目录并用下面命令部署应用[ZEIT Now](https://zeit.co/now).

```sh
now
```

<a id="limitation" style="display: none"></a>

### 限制

使用`next export`，我们创建了个静态 HTML 应用。构建时将会运行页面里生命周期`getInitialProps` 函数。

`req`和`res`只在服务端可用，不能通过`getInitialProps`。

> 所以你不能预构建 HTML 文件时动态渲染 HTML 页面。如果你想动态渲染可以运行`next start`或其他自定义服务端 API。

<a id="multi-zones" style="display: none"></a>

## 多 zone

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-zones">With Zones</a></li></ul>
</details></p>

一个 zone 时一个单独的 Next.js 应用。如果你有很多 zone，你可以合并成一个应用。

例如，你如下有两个 zone：

- https://docs.my-app.com 服务于路由 `/docs/**`
- https://ui.my-app.com 服务于所有页面

有多 zone 应用技术支持，你可以将几个应用合并到一个，而且可以自定义 URL 路径，使你能同时单独开发各个应用。

> 与 microservices 观念类似, 只是应用于前端应用.

<a id="how-to-define-a-zone" style="display: none"></a>

### 怎么定义一个 zone

zone 没有单独的 API 文档。你需要做下面事即可：

- 确保你的应用里只有需要的页面 (例如, https://ui.my-app.com 不包含 `/docs/**`)
- 确保你的应用有个前缀[assetPrefix](https://github.com/zeit/next.js#cdn-support-with-asset-prefix)。（你也可以定义动态前缀[dynamically](https://github.com/zeit/next.js#dynamic-assetprefix)）

<a id="how-to-merge-them" style="display: none"></a>

### 怎么合并他们

你能使用 HTTP 代理合并 zone

你能使用代理[micro proxy](https://github.com/zeit/micro-proxy)来作为你的本地代理服务。它允许你定义路由规则如下：

```json
{
  "rules": [
    {
      "pathname": "/docs**",
      "method": ["GET", "POST", "OPTIONS"],
      "dest": "https://docs.my-app.com"
    },
    { "pathname": "/**", "dest": "https://ui.my-app.com" }
  ]
}
```

生产环境部署，如果你使用了[ZEIT now](https://zeit.co/now)，可以它的使用[path alias](https://zeit.co/docs/features/path-aliases) 功能。否则，你可以设置你已使用的代理服务编写上面规则来路由 HTML 页面

<a id="recipes" style="display: none"></a>

## 技巧

- [设置 301 重定向](https://www.raygesualdo.com/posts/301-redirects-with-nextjs/)
- [只处理服务器端模块](https://arunoda.me/blog/ssr-and-server-only-modules)
- [构建项目 React-Material-UI-Next-Express-Mongoose-Mongodb](https://github.com/builderbook/builderbook)
- [构建一个 SaaS 产品 React-Material-UI-Next-MobX-Express-Mongoose-MongoDB-TypeScript](https://github.com/async-labs/saas)

<a id="faq" style="display: none"></a>

## 问答

<details>
  <summary>这个产品可以用于生产环境吗？</summary>
  https://zeit.co 都是一直用 Next.js 写的。

它的开发体验和终端用户体验都很好，所以我们决定开源出来给大家共享。

</details>

<details>
  <summary>体积多大？</summary>

客户端大小根据应用需求不一样大小也不一样。

一个最简单 Next 应该用 gzip 压缩后大约 65kb

</details>

<details>
  <summary>这个像 `create-react-app`?</summary>

是或不是.

是，因为它让你的 SSR 开发更简单。

不是，因为它规定了一定的目录结构，使我们能做以下更高级的事：

- 服务端渲染
- 自动代码分割

此外，Next.js 还提供两个内置特性：

- 路由与懒加载组件: `<Link>` (通过引入 `next/link`)
- 修改`<head>`的组件: `<Head>` (通过引入 `next/head`)

如果你想写共用组件，可以嵌入 Next.js 应用和 React 应用中，推荐使用`create-react-app`。你可以更改`import`保持代码清晰。

</details>

<details>
  <summary>怎么解决 CSS 嵌入 JS 问题?</summary>

Next.js 自带[styled-jsx](https://github.com/zeit/styled-jsx)库支持 CSS 嵌入 JS。而且你可以选择其他嵌入方法到你的项目中，可参考文档[as mentioned before](#css-in-js)。

</details>

<details>
  <summary>哪些语法会被转换？怎么转换它们？</summary>

我们遵循 V8 引擎的，如今 V8 引擎广泛支持 ES6 语法以及`async`和`await`语法，所以我们支持转换它们。但是 V8 引擎不支持修饰器语法，所以我们也不支持转换这语法。

可以参照[这些](https://github.com/zeit/next.js/blob/master/server/build/webpack.js#L79) 以及 [这些](https://github.com/zeit/next.js/issues/26)

</details>

<details>
  <summary>为什么使用新路由?</summary>

Next.js 的特别之处如下所示:

- 路由不需要被提前知道
- 路由总是被懒加载
- 顶层组件可以定义生命周期`getInitialProps`来阻止路由加载（当服务端渲染或路由懒加载时）

因此,我们可以介绍一个非常简单的路由方法,它由下面两部分组成:

- 每个顶层组件都将会收到一个`url`对象，来检查 url 或修改历史记录
- `<Link />`组件用于包装如(`<a/>`)标签的元素容器，来执行客户端转换。

我们使用了些有趣的场景来测试路由的灵活性，例如，可查看[nextgram](https://github.com/zeit/nextgram)。

</details>

<details>
<summary>我怎么定义自定义路由?</summary>

我们通过请求处理来[添加](#custom-server-and-routing)任意 URL 与任意组件之前的映射关系。

在客户端，我们`<Link>`组件有个属性`as`，可以装饰改变获取到的 URL。

</details>

<details>
<summary>怎么获取数据?</summary>

这由你决定。`getInitialProps`是一个异步函数`async`（也就是函数将会返回个`Promise`）。你可以在任意位置获取数据。

</details>

<details>
  <summary>我可以使用 GraphQL 吗?</summary>

是的! 这里有个例子[Apollo](./examples/with-apollo).

</details>

<details>
<summary>我可以使用 Redux 吗?</summary>

是的! 这里有个[例子](./examples/with-redux)

</details>

<details>
<summary>我可以在 Next 应用中使用我喜欢的 Javascript 库或工具包吗?</summary>

从我们第一次发版就已经提供**很多**例子，你可以查看这些[例子](./examples)。

</details>

<details>
<summary>什么启发我们做这个?</summary>

我们实现的大部分目标都是通过 Guillermo Rauch 的[Web 应用的 7 原则](http://rauchg.com/2014/7-principles-of-rich-web-applications/)来启发出的。

PHP 的易用性也是个很好的灵感来源，我们觉得 Next.js 可以替代很多需要用 PHP 输出 HTML 的场景。

与 PHP 不同的是，我们得利于 ES6 模块系统，每个文件会输出一个**组件或方法**，以便可以轻松的导入用于懒加载和测试

我们研究 React 的服务器渲染时并没有花费很大的步骤，因为我们发现一个类似于 Next.js 的产品，React 作者 Jordan Walke 写的[react-page](https://github.com/facebookarchive/react-page) (现在已经废弃)

</details>

<a id="contributing" style="display: none"></a>

## 贡献

可查看 [contributing.md](./contributing.md)

<a id="authors" style="display: none"></a>

## 作者

- Arunoda Susiripala ([@arunoda](https://twitter.com/arunoda)) – [ZEIT](https://zeit.co)
- Tim Neutkens ([@timneutkens](https://twitter.com/timneutkens)) – [ZEIT](https://zeit.co)
- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – [ZEIT](https://zeit.co)
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – [ZEIT](https://zeit.co)
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – [ZEIT](https://zeit.co)
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project
