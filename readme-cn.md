<img width="112" alt="screen shot 2016-10-25 at 2 37 27 pm" src="https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png">

[![NPM version](https://img.shields.io/npm/v/next.svg)](https://www.npmjs.com/package/next)
[![Build Status](https://travis-ci.org/zeit/next.js.svg?branch=master)](https://travis-ci.org/zeit/next.js)
[![Build status](https://ci.appveyor.com/api/projects/status/gqp5hs71l3ebtx1r/branch/master?svg=true)](https://ci.appveyor.com/project/arunoda/next-js/branch/master)
[![Coverage Status](https://coveralls.io/repos/zeit/next.js/badge.svg?branch=master)](https://coveralls.io/r/zeit/next.js?branch=master)
[![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/next-js)

Next.js 是一个轻巧的React服务端渲染应用框架。

**可访问 [nextjs.org/learn](https://nextjs.org/learn) 开始学习 Next.js.**

[README in English](readme.md)

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
      - [组件支持点击事件 `onClick`](#using-a-component-that-supports-onclick)
      - [暴露 `href` 给子元素](#forcing-the-link-to-expose-href-to-its-child)
      - [禁止滚动到页面顶部](#disabling-the-scroll-changes-to-top-on-page)
    - [命令式](#imperatively)
    - [拦截器 `popstate`](#intercepting-popstate)
      - [URL对象用法](#with-url-object-1)
      - [路由事件](#router-events)
      - [浅层路由](#shallow-routing)
    - [高阶组件](#using-a-higher-order-component)
  - [预加载页面](#prefetching-pages)
    - [`<Link>`用法](#with-link-1)
    - [命令式prefetch写法](#imperatively-1)
  - [自定义服务端路由](#custom-server-and-routing)
    - [禁止文件路由](#disabling-file-system-routing)
    - [动态前缀](#dynamic-assetprefix)
  - [动态导入](#dynamic-import)
    - [1. 基础支持 (同样支持 SSR)](#1-basic-usage-also-does-ssr)
    - [2. 自定义加载组件](#2-with-custom-loading-component)
    - [3. 禁止使用SSR](#3-with-no-ssr)
    - [4. 同时加载多个模块](#4-with-multiple-modules-at-once)
  - [自定义 `<App>`](#custom-app)
  - [自定义 `<Document>`](#custom-document)
  - [自定义错误处理](#custom-error-handling)
  - [渲染内置错误页面](#reusing-the-built-in-error-page)
  - [自定义配置](#custom-configuration)
    - [设置自定义构建目录](#setting-a-custom-build-directory)
    - [禁止etag生成](#disabling-etag-generation)
    - [配置onDemandEntries](#configuring-the-ondemandentries)
    - [配置页面后缀名解析扩展](#configuring-extensions-looked-for-when-resolving-pages-in-pages)
    - [配置构建ID](#configuring-the-build-id)
  - [自定义webpack配置](#customizing-webpack-config)
  - [自定义babel配置](#customizing-babel-config)
  - [暴露配置到服务端和客户端](#exposing-configuration-to-the-server--client-side)
  - [启动服务选择hostname](#starting-the-server-on-alternative-hostname)
  - [CDN支持前缀](#cdn-support-with-asset-prefix)
- [项目部署](#production-deployment)
- [浏览器支持](#browser-support)
- [导出静态页面](#static-html-export)
  - [使用](#usage)
  - [限制](#limitation)
- [多zone](#multi-zones)
  - [怎么定义一个zone](#how-to-define-a-zone)
  - [怎么合并他们](#how-to-merge-them)
- [技巧](#recipes)
- [FAQ](#faq)
- [贡献](#contributing)
- [作者](#authors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## 怎么使用
<a id="how-to-use" style="display: none"></a>

### 安装
<a id="setup" style="display: none"></a>

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

下面, 文件系统是主要的API. 每个`.js` 文件将变成一个路由，自动处理和渲染。

新建 `./pages/index.js` 到你的项目中:

```jsx
export default () => <div>Welcome to next.js!</div>
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
import cowsay from 'cowsay-browser'

export default () =>
  <pre>
    {cowsay.say({ text: 'hi there!' })}
  </pre>
```

### CSS

<a id="built-in-css-support" style="display: none"></a>
#### 支持嵌入样式

<p><details>
  <summary><b>案例</b></summary>
  <ul><li><a href="https://github.com/zeit/next.js/tree/canary/examples/basic-css">Basic css</a></li></ul>
</details></p>

我们绑定 [styled-jsx](https://github.com/zeit/styled-jsx) 来生成独立作用域的CSS. 目标是支持 "shadow CSS",但是 [不支持独立模块作用域的js](https://github.com/w3c/webcomponents/issues/71).

```jsx
export default () =>
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

有些情况可以使用css内嵌js写法。如下所示：

```jsx
export default () => <p style={{ color: 'red' }}>hi there</p>
```

更复杂的内嵌样式解决方案，特别是服务端渲染的时样式更改。我们可以通过包裹自定义Document，来添加样式，案例如下：[custom `<Document>`](#user-content-custom-document)

<a id="importing-css--sass--less--stylus-files" style="display: none"></a>
#### 使用 CSS / Sass / Less / Stylus files

To support importing `.css`, `.scss`, `.less` or `.styl` files you can use these modules, which configure sensible defaults for server rendered applications.
支持用`.css`, `.scss`, `.less` or `.styl`，需要配置默认文件next.config.js，具体可查看下面链接

- [@zeit/next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css)
- [@zeit/next-sass](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
- [@zeit/next-less](https://github.com/zeit/next-plugins/tree/master/packages/next-less)
- [@zeit/next-stylus](https://github.com/zeit/next-plugins/tree/master/packages/next-stylus)

<a id="static-file-serving-eg-images" style="display: none"></a>
### 静态文件服务（如图像）

在根目录下新建文件夹叫`static`。代码可以通过`/static/`来引入相关的静态资源。

```jsx
export default () => <img src="/static/my-image.png" alt="my image" />
```

_注意：不要自定义静态文件夹的名字，只能叫`static` ，因为只有这个名字Next.js才会把它当作静态资源。


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
import Head from 'next/head'

export default () =>
  <div>
    <Head>
      <title>My page title</title>
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <p>Hello world!</p>
  </div>
```

我们定义`key`属性来避免重复的`<head>` 标签，保证`<head>` 只渲染一次，如下所示：

```jsx
import Head from 'next/head'
export default () => (
  <div>
    <Head>
      <title>My page title</title>
      <meta name="viewport" content="initial-scale=1.0, width=device-width" key="viewport" />
    </Head>
    <Head>
      <meta name="viewport" content="initial-scale=1.2, width=device-width" key="viewport" />
    </Head>
    <p>Hello world!</p>
  </div>
)
```

只有第二个`<meta name="viewport" />`才被渲染。

注意：在卸载组件时，' <head> '的内容将被清除。请确保每个页面都在其`<head>`定义了所需要的内容，而不是假设其他页面已经加过了

<a id="fetching-data-and-component-lifecycle" style="display: none"></a>
### 获取数据以及组件生命周期

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/data-fetch">Data fetch</a></li></ul>
</details></p>

如果你需要一个有状态、生命周期或有初始数据的React组件（而不是上面的无状态函数），如下所示：

```jsx
import React from 'react'

export default class extends React.Component {
  static async getInitialProps({ req }) {
    const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
    return { userAgent }
  }

  render() {
    return (
      <div>
        Hello World {this.props.userAgent}
      </div>
    )
  }
}
```

相信你注意到，当页面渲染时加载数据，我们使用了一个异步方法`getInitialProps`。它能异步获取js普通对象，并绑定在`props`上

当服务渲染时，`getInitialProps`将会把数据序列化，就像`JSON.stringify`。所以确保`getInitialProps`返回的是一个普通js对象，而不是`Date`, `Map` 或 `Set`类型。

当页面初次加载时，`getInitialProps`只会在服务端执行一次。`getInitialProps`只有在路由切换的时候（如`Link`组件跳转或路由自定义跳转）时，客户端的才会被执行。

当页面初始化加载时，`getInitialProps`只会加载在服务端。只有当路由跳转（`Link`组件跳转或API方法跳转）时，客户端才会执行`getInitialProps`。

_Note: `getInitialProps` can **not** be used in children components. Only in `pages`._

注意：`getInitialProps`将不能使用在子组件中。只能使用在`pages`页面中。

<br/>

> 只有服务端用到的模块放在 `getInitialProps`里，请确保正确的导入了它们，可参考[import them properly](https://arunoda.me/blog/ssr-and-server-only-modules)。
> 否则会拖慢你的应用速度。

<br/>

你也可以给5⃣无状态组件定义 `getInitialProps`：

```jsx
const Page = ({ stars }) =>
  <div>
    Next stars: {stars}
  </div>

Page.getInitialProps = async ({ req }) => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()
  return { stars: json.stargazers_count }
}

export default Page
```

`getInitialProps`入参对象的属性如下：

- `pathname` - URL的path部分
- `query` - URL的query部分，并被解析成对象
- `asPath` - 显示在浏览器中的实际路径（包含查询部分），为`String`类型
- `req` - HTTP请求对象 (只有服务器端有)
- `res` - HTTP返回对象 (只有服务器端有)
- `jsonPageRes` - [获取数据响应对象](https://developer.mozilla.org/en-US/docs/Web/API/Response) (只有客户端有)
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
import Link from 'next/link'

export default () =>
  <div>
    Click{' '}
    <Link href="/about">
      <a>here</a>
    </Link>{' '}
    to read more
  </div>
```

```jsx
// pages/about.js
export default () => <p>Welcome to About!</p>
```

注意：可以使用[`<Link prefetch>`](#prefetching-pages)使链接和预加载在后台同时进行，来达到页面的最佳性能。

客户端路由行为与浏览器很相似：

1. 组件获取
2. If it defines `getInitialProps`, data is fetched. If an error occurs, `_error.js` is rendered2. 
2. 如果组件定义了`getInitialProps`，数据获取了。如果有错误情况将会渲染 `_error.js`。
3. After 1 and 2 complete, `pushState` is performed and the new component is rendered
3. 1和2都完成了，`pushState`执行，新组件被渲染。

**不建议使用该特性，使用[withRouter](https://github.com/zeit/next.js#using-a-higher-order-component)来代替** - 每个顶级组件都接收`url` 属性，API如下：

- `pathname` - `String` of the current path excluding the query string
- `pathname` - 不包含查询内容的当前路径，为`String`类型
- `query` - 查询内容，被解析成`Object`类型. 默认为`{}`
- `asPath` - 展现在浏览器上的实际路径，包含查询内容，为`String`类型

<a id="with-url-object" style="display: none"></a>
##### URL 对象

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-url-object-routing">With URL Object Routing</a></li>
  </ul>
</details></p>

组件`<Link>`接收URL对象，而且它会自动格式化生成URL字符串

```jsx
// pages/index.js
import Link from 'next/link'

export default () =>
  <div>
    Click{' '}
    <Link href={{ pathname: '/about', query: { name: 'Zeit' } }}>
      <a>here</a>
    </Link>{' '}
    to read more
  </div>
```

将生成URL字符串`/about?name=Zeit`，你可以使用任何在[Node.js URL module documentation](https://nodejs.org/api/url.html#url_url_strings_and_url_objects)定义过的属性。


<a id="replace-instead-of-push-url" style="display: none"></a>
##### 替换路由

The default behaviour for the `<Link>` component is to `push` a new url into the stack. You can use the `replace` prop to prevent adding a new entry.

```jsx
// pages/index.js
import Link from 'next/link'

export default () =>
  <div>
    Click{' '}
    <Link href="/about" replace>
      <a>here</a>
    </Link>{' '}
    to read more
  </div>
```

<a id="using-a-component-that-supports-onclick" style="display: none"></a>
##### 组件支持点击事件 `onClick`

`<Link>` supports any component that supports the `onClick` event. In case you don't provide an `<a>` tag, it will only add the `onClick` event handler and won't pass the `href` property.

```jsx
// pages/index.js
import Link from 'next/link'

export default () =>
  <div>
    Click{' '}
    <Link href="/about">
      <img src="/static/image.png" alt="image" />
    </Link>
  </div>
```

<a id="forcing-the-link-to-expose-href-to-its-child" style="display: none"></a>
##### 暴露 `href` 给子元素

If child is an `<a>` tag and doesn't have a href attribute we specify it so that the repetition is not needed by the user. However, sometimes, you’ll want to pass an `<a>` tag inside of a wrapper and the `Link` won’t recognize it as a *hyperlink*, and, consequently, won’t transfer its `href` to the child. In cases like that, you should define a boolean `passHref` property to the `Link`, forcing it to expose its `href` property to the child.

**Please note**: using a tag other than `a` and failing to pass `passHref` may result in links that appear to navigate correctly, but, when being crawled by search engines, will not be recognized as links (owing to the lack of `href` attribute). This may result in negative effects on your sites SEO.

```jsx
import Link from 'next/link'
import Unexpected_A from 'third-library'

export default ({ href, name }) =>
  <Link href={href} passHref>
    <Unexpected_A>
      {name}
    </Unexpected_A>
  </Link>
```

<a id="disabling-the-scroll-changes-to-top-on-page" style="display: none"></a>
##### 禁止滚动到页面顶部

`<Link>`的默认行为就是滚到页面顶部。当有hash定义时（＃），页面将会滚动到对应的id上，就像`<a>`标签一样。为了预防滚动到顶部，可以给`<Link>`加
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
import Router from 'next/router'

export default () =>
  <div>
    Click <span onClick={() => Router.push('/about')}>here</span> to read more
  </div>
```

<a id="intercepting-popstate" style="display: none"></a>
#### 拦截器 `popstate`

有些情况（比如使用[custom router](#custom-server-and-routing)），你可能想监听[`popstate`](https://developer.mozilla.org/en-US/docs/Web/Events/popstate)，在路由跳转前做一些动作。
比如，你可以操作request或强制SSR刷新

```jsx
import Router from 'next/router'

Router.beforePopState(({ url, as, options }) => {
  // I only want to allow these two routes!
  if (as !== "/" || as !== "/other") {
    // Have SSR render bad routes as a 404.
    window.location.href = as
    return false
  }

  return true
});
```

如果你在`beforePopState`中返回false，`Router`将不会执行`popstate`事件。
例如[Disabling File-System Routing](#disabling-file-system-routing)。

以上`Router`对象的API如下：

- `route` - 当前路由的`String`类型
- `pathname` - 不包含查询内容的当前路径，为`String`类型
- `query` - 查询内容，被解析成`Object`类型. 默认为`{}`
- `asPath` - 展现在浏览器上的实际路径，包含查询内容，为`String`类型
- `push(url, as=url)` - 页面渲染第一个参数url的页面，浏览器栏显示的是第二个参数url
- `replace(url, as=url)` - performs a `replaceState` call with the given url
- `beforePopState(cb=function)` - 在路由器处理事件之前拦截.

`push` 和 `replace` 函数的第二个参数`as`，是为了装饰URL作用。如果你在服务器端设置了自定义路由将会起作用。

注意：为了用编程方式，而不是用导航栏触发或组件获取的方式来切换路由，可以在组件里使用`props.url.push` 或 `props.url.replace`。

<a id="with-url-object-1" style="display: none"></a>
##### URL对象用法

`push` 或 `replace`可接收的URL对象（`<Link>`组件的URL对象一样）来生成URL。

```jsx
import Router from 'next/router'

const handler = () =>
  Router.push({
    pathname: '/about',
    query: { name: 'Zeit' }
  })

export default () =>
  <div>
    Click <span onClick={handler}>here</span> to read more
  </div>
```

也可以像`<Link>`组件一样添加额外的参数。

<a id="router-events" style="display: none"></a>
##### 路由事件

你可以监听路由相关事件。
下面是事件支持列表：

- `routeChangeStart(url)` - 路由开始切换时触发
- `routeChangeComplete(url)` - 完成路由切换时触发
- `routeChangeError(err, url)` - 路由切换报错时触发
- `beforeHistoryChange(url)` - 浏览器history模式开始切换时触发
- `hashChangeStart(url)` - 开始切换hash值但是没有切换页面路由时触发
- `hashChangeComplete(url)` - 完成切换hash值但是没有切换页面路由时触发

> 这里的`url`是指显示在浏览器中的url。如果你用了`Router.push(url, as)`（或类似的方法），那浏览器中的url将会显示as的值。

下面是如何正确使用路由事件`routeChangeStart`的例子：

```js
const handleRouteChange = url => {
  console.log('App is changing to: ', url)
}

Router.events.on('routeChangeStart', handleRouteChange)
```

如果你不想长期监听该事件，你可以用`off`事件去取消监听：

```js
Router.events.off('routeChangeStart', handleRouteChange)
```

如果路由加载被取消（比如快速连续双击链接）

```js
Router.events.on('routeChangeError', (err, url) => {
  if (err.cancelled) {
    console.log(`Route to ${url} was cancelled!`)
  }
})
```

<a id="shallow-routing" style="display: none"></a>
##### 浅层路由

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-shallow-routing">Shallow Routing</a></li>
  </ul>
</details></p>

浅层路由允许你改变URL但是不执行 `getInitialProps`生命周期。你可以加载相同页面的URL，得到更新后的路由属性`pathname`和`query`，并不失去state状态。

你可以给`Router.push` 或 `Router.replace`方法加`shallow: true`参数。如下面的例子所示：

```js
// Current URL is "/"
const href = '/?counter=10'
const as = href
Router.push(href, as, { shallow: true })
```

现在URL更新为`/?counter=10`。在组件里查看`this.props.url`你将会看到更新的URL。

你可以在[`componentWillReceiveProps`](https://facebook.github.io/react/docs/react-component.html#componentwillreceiveprops)钩子函数中监听URL的变化。

```js
componentWillReceiveProps(nextProps) {
  const { pathname, query } = nextProps.url
  // fetch data based on the new query
}
```

> 注意:
>
> 浅层路由只作用于相同URL的参数改变，比如我们假定有个其他路由`about`，而你向下面代码样运行:
> ```js
> Router.push('/?counter=10', '/about?counter=10', { shallow: true })
> ```
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
import { withRouter } from 'next/router'

const ActiveLink = ({ children, router, href }) => {
  const style = {
    marginRight: 10,
    color: router.pathname === href? 'red' : 'black'
  }

  const handleClick = (e) => {
    e.preventDefault()
    router.push(href)
  }

  return (
    <a href={href} onClick={handleClick} style={style}>
      {children}
    </a>
  )
}

export default withRouter(ActiveLink)
```

上面路由对象的API可以参考[`next/router`](#imperatively).

<a id="prefetching-pages" style="display: none"></a>
### 预加载页面

⚠️ 只有生产环境才有此功能 ⚠️

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-prefetching">Prefetching</a></li></ul>
</details></p>

Next.js有允许你预加载页面的API。

用Next.js服务端渲染你的页面，可以达到所有你应用里所有未来会跳转的路径即时响应，有效的应用Next.js，可以通过预加载应用程序的功能，最大程度的初始化网站性能。[查看更多](https://zeit.co/blog/next#anticipation-is-the-key-to-performance).

> Next.js的预加载功能只预加载JS代码。当页面渲染时，你可能需要等待数据请求。

<a id="with-link-1" style="display: none"></a>
#### `<Link>`用法

你可以给<Link>添加 `prefetch` 属性，Next.js将会在后台预加载这些页面。

```jsx
import Link from 'next/link'

// example header component
export default () =>
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
```

<a id="imperatively-1" style="display: none"></a>
#### 命令式prefetch写法

大多数预加载是通过<Link />处理的，但是我们还提供了命令式API用于更复杂的场景。

```jsx
import Router from 'next/router'

export default ({ url }) =>
  <div>
    <a onClick={() => setTimeout(() => url.pushTo('/dynamic'), 100)}>
      A route transition will happen after 100ms
    </a>
    {// but we can prefetch it!
    Router.prefetch('/dynamic')}
  </div>
```

路由实例只允许在应用程序的客户端。以防服务端渲染发生错误，建议prefetch事件写在`componentDidMount()`生命周期里。

```jsx
import React from 'react'
import Router from 'next/router'

export default class MyLink extends React.Component {
  componentDidMount() {
    Router.prefetch('/dynamic')
  }
  
  render() {
    return (
       <div>
        <a onClick={() => setTimeout(() => url.pushTo('/dynamic'), 100)}>
          A route transition will happen after 100ms
        </a>
      </div>   
    )
  }
}
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


When using a custom server with a server file, for example called `server.js`, make sure you update the scripts key in `package.json` to:

一般你使用 `next start` 命令来启动next服务，你还可以编写代码来自定义路由。

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
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true)
    const { pathname, query } = parsedUrl

    if (pathname === '/a') {
      app.render(req, res, '/b', query)
    } else if (pathname === '/b') {
      app.render(req, res, '/a', query)
    } else {
      handle(req, res, parsedUrl)
    }
  }).listen(3000, err => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
```

`next`的API如下所示
- `next(opts: object)`

opts的属性如下:
- `dev` (`boolean`) 判断 Next.js应用是否在开发环境 - 默认 `false`
- `dir` (`string`) Next项目路径 - 默认 `'.'`
- `quiet` (`boolean`) Hide error messages containing server information - 默认 `false`
- `quiet` (`boolean`) 是否隐藏包含服务端消息在内的错误信息 - 默认 `false`
- `conf` (`object`) 与`next.config.js`的对象相同 - 默认 `{}`

生产环境的话，可以更改package.json里的`start`脚本为`NODE_ENV=production node server.js`。

<a id="disabling-file-system-routing" style="display: none"></a>
#### 禁止文件路由
默认情况，`Next`将会把`/pages`下的所有文件匹配路由（如`/pages/some-file.js` 渲染为 `site.com/some-file`）

如果你的项目使用自定义路由，那么有可能不同的路由会得到相同的内容，可以优化SEO和用户体验。

禁止路由链接到`/pages`下的文件，只需设置`next.config.js`文件如下所示：

```js
// next.config.js
module.exports = {
  useFileSystemPublicRoutes: false
}
```

注意`useFileSystemPublicRoutes`只禁止服务端的文件路由；但是客户端的还是禁止不了。

你如果想配置客户端路由不能跳转文件路由，可以参考[Intercepting `popstate`](#intercepting-popstate)。

<a id="dynamic-assetprefix" style="display: none"></a>
#### 动态前缀

有时你需要设置动态前缀，可以在请求时设置`assetPrefix`改变前缀。

使用方法如下：

```js
const next = require('next')
const micro = require('micro')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = micro((req, res) => {
    // Add assetPrefix support based on the hostname
    if (req.headers.host === 'my-app.com') {
      app.setAssetPrefix('http://cdn.com/myapp')
    } else {
      app.setAssetPrefix('')
    }

    handleNextRequests(req, res)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }

    console.log(`> Ready on http://localhost:${port}`)
  })
})

```

<a id="dynamic-import" style="display: none"></a>
### 动态导入

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-dynamic-import">With Dynamic Import</a></li>
  </ul>
</details></p>

ext.js支持JavaScript的TC39提议[dynamic import proposal](https://github.com/tc39/proposal-dynamic-import)。你可以动态导入JavaScript模块（如React组件）。

动态导入相当于把代码分成各个块管理。Next.js服务端动态导入功能，你可以做很多炫酷事情。

下面介绍一些动态导入方式：

<a id="1-basic-usage-also-does-ssr" style="display: none"></a>
#### 1. 基础支持 (同样支持 SSR)

```jsx
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(import('../components/hello'))

export default () =>
  <div>
    <Header />
    <DynamicComponent />
    <p>HOME PAGE is here!</p>
  </div>
```

<a id="2-with-custom-loading-componen" style="display: none"></a>
#### 2. 自定义加载组件

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithCustomLoading = dynamic(
  import('../components/hello2'),
  {
    loading: () => <p>...</p>
  }
)

export default () =>
  <div>
    <Header />
    <DynamicComponentWithCustomLoading />
    <p>HOME PAGE is here!</p>
  </div>
```

<a id="3-with-no-ssr" style="display: none"></a>
#### 3. 禁止使用SSR

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithNoSSR = dynamic(import('../components/hello3'), {
  ssr: false
})

export default () =>
  <div>
    <Header />
    <DynamicComponentWithNoSSR />
    <p>HOME PAGE is here!</p>
  </div>
```

<a id="4-with-multiple-modules-at-once" style="display: none"></a>
#### 4. 同时加载多个模块

```jsx
import dynamic from 'next/dynamic'

const HelloBundle = dynamic({
  modules: () => {
    const components = {
      Hello1: import('../components/hello1'),
      Hello2: import('../components/hello2')
    }

    return components
  },
  render: (props, { Hello1, Hello2 }) =>
    <div>
      <h1>
        {props.title}
      </h1>
      <Hello1 />
      <Hello2 />
    </div>
})

export default () => <HelloBundle title="Dynamic Bundle" />
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
- 注入额外数据到页面里 (如GraphQL查询)

重写的话，新建`./pages/_app.js`文件，重写App模块如下所示：

```js
import App, {Container} from 'next/app'
import React from 'react'

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props
    return <Container>
      <Component {...pageProps} />
    </Container>
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
- 通常实现服务端渲染会使用一些css-in-js库，如[styled-components](./examples/with-styled-components), [glamorous](./examples/with-glamorous) 或 [emotion](with-emotion)。[styled-jsx](https://github.com/zeit/styled-jsx)是Next.js自带默认使用的css-in-js库

`Next.js`会自动定义文档标记，比如，你从来不需要添加`<html>`, `<body>`等。如果想自定义文档标记，你可以新建`./pages/_document.js`，然后扩展`Document`类：

```jsx
// _document is only rendered on the server side and not on the client side
// Event handlers like onClick can't be added to this file

// ./pages/_document.js
import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
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
    )
  }
}
```

钩子[`getInitialProps`](#fetching-data-and-component-lifecycle)接收到的参数`ctx`对象都是一样的

- 回调函数`renderPage`是会执行React渲染逻辑的函数(同步)，这种做法有助于此函数支持一些类似于 Aphrodite的 renderStatic等一些服务器端渲染容器。

__注意：`<Main />`外的React组件将不会渲染到浏览器中，所以那添加应用逻辑代码。如果你页面需要公共组件（菜单或工具栏），可以参照上面说的`App`组件代替。__

<a id="custom-error-handling" style="display: none"></a>
### 自定义错误处理

404和500错误客户端和服务端都会通过`error.js`组件处理。如果你想改写它，则新建`_error.js`在文件夹中：

```jsx
import React from 'react'

export default class Error extends React.Component {
  static getInitialProps({ res, err }) {
    const statusCode = res ? res.statusCode : err ? err.statusCode : null;
    return { statusCode }
  }

  render() {
    return (
      <p>
        {this.props.statusCode
          ? `An error ${this.props.statusCode} occurred on server`
          : 'An error occurred on client'}
      </p>
    )
  }
}
```

<a id="reusing-the-built-in-error-page" style="display: none"></a>
### 渲染内置错误页面

如果你想渲染内置错误页面，你可以使用`next/error`：

```jsx
import React from 'react'
import Error from 'next/error'
import fetch from 'isomorphic-unfetch'

export default class Page extends React.Component {
  static async getInitialProps() {
    const res = await fetch('https://api.github.com/repos/zeit/next.js')
    const statusCode = res.statusCode > 200 ? res.statusCode : false
    const json = await res.json()

    return { statusCode, stars: json.stargazers_count }
  }

  render() {
    if (this.props.statusCode) {
      return <Error statusCode={this.props.statusCode} />
    }

    return (
      <div>
        Next stars: {this.props.stars}
      </div>
    )
  }
}
```

> 如果你自定义了个错误页面，你可以引入自己的错误页面来代替`next/error`

<a id="custom-configuration" style="display: none"></a>
### 自定义配置

如果你想自定义Next.js的高级配置，可以在根目录下新建`next.config.js`文件（与`pages/` 和 `package.json`一起）

注意：`next.config.js`是一个Node.js模块，不是一个JSON文件，可以用于Next启动服务已经构建阶段，但是不作用于浏览器端。

```js
// next.config.js
module.exports = {
  /* config options here */
}
```

或使用一个函数：

```js
module.exports = (phase, {defaultConfig}) => {
  //
  // https://github.com/zeit/
  return {
    /* config options here */
  }
}
```

`phase`是配置文件被加载时的当前内容。你可看到所有的phases常量：[constants](./lib/constants.js)
这些常量可以通过`next/constants`引入：

```js
const {PHASE_DEVELOPMENT_SERVER} = require('next/constants')
module.exports = (phase, {defaultConfig}) => {
  if(phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      /* development only config options here */
    }
  }

  return {
    /* config options for all phases except development here */
  }
}
```

<a id="setting-a-custom-build-directory" style="display: none"></a>
#### 设置自定义构建目录

你可以自定义一个构建目录，如新建`build`文件夹来代替`.next` 文件夹成为构建目录。如果没有配置构建目录，构建时将会自动新建`.next`文件夹

```js
// next.config.js
module.exports = {
  distDir: 'build'
}
```

<a id="disabling-etag-generation" style="display: none"></a>
#### 禁止etag生成

你可以禁止etag生成根据你的缓存策略。如果没有配置，Next将会生成etags到每个页面中。

```js
// next.config.js
module.exports = {
  generateEtags: false
}
```

<a id="configuring-the-ondemandentries" style="display: none"></a>
#### 配置onDemandEntries

Next暴露一些选项来给你控制服务器部署以及缓存页面：

```js
module.exports = {
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  }
}
```

这个只是在开发环境才有的功能。如果你在生成环境中想缓存SSR页面，请查看[SSR-caching](https://github.com/zeit/next.js/tree/canary/examples/ssr-caching

<a id="configuring-extensions-looked-for-when-resolving-pages-in-pages" style="display: none"></a>
#### 配置页面后缀名解析扩展

如typescript模块[`@zeit/next-typescript`](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript)，需要支持解析后缀名为`.ts`的文件。`pageExtensions` 允许你扩展后缀名来解析各种pages下的文件。

```js
// next.config.js
module.exports = {
  pageExtensions: ['jsx', 'js']
}
```

<a id="configuring-the-build-id" style="display: none"></a>
#### 配置构建ID

Next.js使用一个常量来判断你的应用服务是哪个版本。因为多个服务部署应用，那`next build`命令将会在多个服务器中运行，为了保持同一个构建ID，可以配置`generateBuildId`函数：

```js
// next.config.js
module.exports = {
  generateBuildId: async () => {
    // For example get the latest git commit hash here
    return 'my-build-id'
  }
}
```

<a id="customizing-webpack-config" style="display: none"></a>
### 自定义webpack配置

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

*注意： `webpack`方法将被执行两次，一次在服务端一次在客户端。你可以用`isServer`属性区分客户端和服务端来配置*

多配置可以组合在一起，如：

```js
const withTypescript = require('@zeit/next-typescript')
const withSass = require('@zeit/next-sass')

module.exports = withTypescript(withSass({
  webpack(config, options) {
    // Further custom configuration here
    return config
  }
}))
```

为了扩展`webpack`使用，可以在`next.config.js`定义函数。

```js
// next.config.js is not transformed by Babel. So you can only use javascript features supported by your version of Node.js.

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Perform customizations to webpack config
    // Important: return the modified config
    return config
  },
  webpackDevMiddleware: config => {
    // Perform customizations to webpack dev middleware config
    // Important: return the modified config
    return config
  }
}
```

`webpack`的第二个参数是个对象，你可以自定义配置它，对象属性如下所示：

- `buildId` - 字符串类型，构建的唯一标示
- `dev` - `Boolean`型，判断你是否在开发环境下
- `isServer` - `Boolean` 型，为`true`使用在服务端, 为`false`使用在客户端.
- `defaultLoaders` - 对象型 ，内部加载器, 你可以如下配置
  - `babel` - 对象型，配置`babel-loader.
  - `hotSelfAccept` - 对象型， `hot-self-accept-loader`配置选项.这个加载器只能用于高阶案例。如 [`@zeit/next-typescript`](https://github.com/zeit/next-plugins/tree/master/packages/next-typescript)添加顶层typescript页面。

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
          loader: '@mdx-js/loader',
          options: pluginOptions.options
        }
      ]
    })

    return config
  }
}
```

<a id="customizing-babel-config" style="display: none"></a>
### 自定义babel配置

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-custom-babel-config">Custom babel configuration</a></li></ul>
</details></p>

为了扩展方便我们使用`babel`，可以在应用根目录新建`.babelrc`文件，该文件可配置。

如果有该文件，我们将会考虑来源的真实性，因此同样你需要定义next，也就是 `next/babel`预设。

下面是`.babelrc`文件案例：

```json
{
  "presets": ["next/babel"],
  "plugins": []
}
```

`next/babel`预设可处理各种React应用所需要的情况。包括：

- preset-env
- preset-react
- plugin-proposal-class-properties
- plugin-proposal-object-rest-spread
- plugin-transform-runtime
- styled-jsx

presets / plugins不允许添加到`.babelrc`中，然而你可以配置`next/babel`预设：

```json
{
  "presets": [
    ["next/babel", {
      "preset-env": {},
      "transform-runtime": {},
      "styled-jsx": {},
      "class-properties": {}
    }]
  ],
  "plugins": []
}
```

`"preset-env"`模块选项应该保持为false，否则webpack代码分割将被禁用。


<a id="exposing-configuration-to-the-server--client-side" style="display: none"></a>
### 暴露配置到服务端和客户端

`next/config`模块使你应用运行时可以读取些存储在`next.config.js`的配置项。`serverRuntimeConfig`属性只在服务器端可用，`publicRuntimeConfig`属性在服务端和客户端可用。

```js
// next.config.js
module.exports = {
  serverRuntimeConfig: { // Will only be available on the server side
    mySecret: 'secret'
  },
  publicRuntimeConfig: { // Will be available on both server and client
    staticFolder: '/static',
    mySecret: process.env.MY_SECRET // Pass through env variables
  }
}
```

```js
// pages/index.js
import getConfig from 'next/config'
// Only holds serverRuntimeConfig and publicRuntimeConfig from next.config.js nothing else.
const {serverRuntimeConfig, publicRuntimeConfig} = getConfig()

console.log(serverRuntimeConfig.mySecret) // Will only be available on the server side
console.log(publicRuntimeConfig.staticFolder) // Will be available on both server and client

export default () => <div>
  <img src={`${publicRuntimeConfig.staticFolder}/logo.png`} alt="logo" />
</div>
```

<a id="starting-the-server-on-alternative-hostname" style="display: none"></a>
### 启动服务选择hostname

启动开发环境服务可以设置不同的hostname，你可以在启动命令后面加上`--hostname 主机名` 或 `-H 主机名`。它将会启动一个TCP服务器来监听连接所提供的主机。

<a id="cdn-support-with-asset-prefix" style="display: none"></a>
### CDN支持前缀

建立一个CDN，你能配置`assetPrefix`选项，去配置你的CDN源。

```js
const isProd = process.env.NODE_ENV === 'production'
module.exports = {
  // You may only need to add assetPrefix in the production.
  assetPrefix: isProd ? 'https://cdn.mydomain.com' : ''
}
```

注意：Next.js运行时将会自动添加前缀，但是对于`/static`是没有效果的，如果你想这些静态资源也能使用CDN，你需要自己添加前缀。有一个方法可以判断你的环境来加前缀，如 [in this example](https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration)。

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

Next.js也有其他托管解决方案。请查考wiki章节['Deployment'](https://github.com/zeit/next.js/wiki/Deployment) 。

注意：`NODE_ENV`可以通过`next`命令配置，如果没有配置，会最大渲染，如果你使用编程式写法的话[programmatically](#custom-server-and-routing)，你需要手动设置`NODE_ENV=production`。

注意：推荐将`.next`或自定义打包文件夹[custom dist folder](https://github.com/zeit/next.js#custom-configuration)放入`.gitignore` 或 `.npmignore`中。否则，使用`files` 或 `now.files`
添加部署白名单，并排除`.next`或自定义打包文件夹。

<a id="browser-support" style="display: none"></a>
## 浏览器支持

Next.js支持IE11和所有的现代浏览器使用了[`@babel/preset-env`](https://new.babeljs.io/docs/en/next/babel-preset-env.html)没包括polyfills。有时候你的代码或引入的其他npm包的部分功能现代浏览器不支持，则需要用polyfills去实现。

ployflls实现案例为[polyfills](https://github.com/zeit/next.js/tree/canary/examples/with-polyfills)。

<a id="static-html-export" style="display: none"></a>
## 导出静态页面

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-static-export">Static export</a></li></ul>
</details></p>

`next export`可以输出一个Next.js应用作为静态资源应用而不依靠 Node.js服务。
这个输出的应用几乎支持Next.js的所有功能，包括动态路由，预获取，预加载以及动态导入。

`next export`将把所有有可能渲染出的HTML都生成。这是基于映射对象的`pathname`关键字关联到页面对象。这个映射叫做`exportPathMap`。

The page object has 2 values:
页面对象有2个属性:

- `page` - 字符串类型，页面生成目录
- `query` - 对象类型，当预渲染时，`query`对象将会传入页面的生命周期`getInitialProps`中。默认为`{}`。


<a id="usage" style="display: none"></a>
### 使用

通常开发Next.js应用你将会运行：

```
next build
next export
```

`next export`命令默认不需要任何配置，将会自动生成默认`exportPathMap`生成`pages`目录下的路由你页面。

如果你想动态配置路由，可以在`next.config.js`中添加异步函数`exportPathMap`。

```js
// next.config.js
module.exports = {
  exportPathMap: async function (defaultPathMap) {
    return {
      '/': { page: '/' },
      '/about': { page: '/about' },
      '/readme.md': { page: '/readme' },
      '/p/hello-nextjs': { page: '/post', query: { title: 'hello-nextjs' } },
      '/p/learn-nextjs': { page: '/post', query: { title: 'learn-nextjs' } },
      '/p/deploy-nextjs': { page: '/post', query: { title: 'deploy-nextjs' } }
    }
  }
}
```

> 注意：如果path的结尾是目录名，则将导出`/dir-name/index.html`，但是如果结尾有扩展名，将会导出对应的文件，如上`/readme.md`。如果你使用`.html`以外的扩展名解析文件时，你需要设置header的`Content-Type`头为"text/html".

输入下面命令：

```sh
next build
next export
```

你可以在`package.json`添加一个NPM脚本，如下所示：

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

现在你可以部署`out`目录到任意静态资源服务器上。注意如果部署GitHub Pages需要加个额外的步骤，[文档如下](https://github.com/zeit/next.js/wiki/Deploying-a-Next.js-app-into-GitHub-Pages)

例如，访问`out`目录并用下面命令部署应用[ZEIT Now](https://zeit.co/now).

```sh
now
```

<a id="limitation" style="display: none"></a>
### 限制

使用`next export`，我们创建了个静态HTML应用。构建时将会运行页面里生命周期`getInitialProps` 函数。

`req`和`res`只在服务端可用，不能通过`getInitialProps`。

> 所以你不能预构建HTML文件时动态渲染HTML页面。如果你想动态渲染可以运行`next start`或其他自定义服务端API。

<a id="multi-zones" style="display: none"></a>
## 多zone

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-zones">With Zones</a></li></ul>
</details></p>

一个zone时一个单独的Next.js应用。如果你有很多zone，你可以合并成一个应用。

例如，你如下有两个zone：

* https://docs.my-app.com 服务于路由 `/docs/**`
* https://ui.my-app.com 服务于所有页面

有多zone应用技术支持，你可以将几个应用合并到一个，而且可以自定义URL路径，使你能同时单独开发各个应用。

> 与microservices观念类似, 只是应用于前端应用.

<a id="how-to-define-a-zone" style="display: none"></a>
### 怎么定义一个zone

zone没有单独的API文档。你需要做下面事即可：

* 确保你的应用里只有需要的页面 (例如, https://ui.my-app.com 不包含 `/docs/**`)
* 确保你的应用有个前缀[assetPrefix](https://github.com/zeit/next.js#cdn-support-with-asset-prefix)。（你也可以定义动态前缀[dynamically](https://github.com/zeit/next.js#dynamic-assetprefix)）

<a id="how-to-merge-them" style="display: none"></a>
### 怎么合并他们

你能使用HTTP代理合并 zone

你能使用代理[micro proxy](https://github.com/zeit/micro-proxy)来作为你的本地代理服务。它允许你定义路由规则如下：

```json
{
  "rules": [
    {"pathname": "/docs**", "method":["GET", "POST", "OPTIONS"], "dest": "https://docs.my-app.com"},
    {"pathname": "/**", "dest": "https://ui.my-app.com"}
  ]
}
```

生产环境部署，如果你使用了[ZEIT now](https://zeit.co/now)，可以它的使用[path alias](https://zeit.co/docs/features/path-aliases) 功能。否则，你可以设置你已使用的代理服务编写上面规则来路由HTML页面

<a id="recipes" style="display: none"></a>
## 技巧

- [设置301重定向](https://www.raygesualdo.com/posts/301-redirects-with-nextjs/)
- [只处理服务器端模块](https://arunoda.me/blog/ssr-and-server-only-modules)
- [构建项目React-Material-UI-Next-Express-Mongoose-Mongodb](https://github.com/builderbook/builderbook)
- [构建一个SaaS产品 React-Material-UI-Next-MobX-Express-Mongoose-MongoDB-TypeScript](https://github.com/async-labs/saas)

<a id="faq" style="display: none"></a>
## 问答

<details>
  <summary>这个产品准备好了吗？</summary>
  Next.js has been powering https://zeit.co since its inception.
   https://zeit.co 都是用Next.js写的。

  We’re ecstatic about both the developer experience and end-user performance, so we decided to share it with the community.
  它的开发体验和终端用户体验都很好，所以我们决定开源出来给大家共享。
</details>

<details>
  <summary>体积多大？</summary>

客户端大小根据应用需求不一样大小也不一样。

一个最简单Next应该用gzip压缩后大约65kb

</details>

<details>
  <summary>这个像 `create-react-app`?</summary>

是或不是.

是，因为它让你的SSR开发更简单。

不是，因为它规定了一定的目录结构，使我们能做以下更高级的事：
- 服务端渲染
- 自动代码分割

此外，Next.js还提供两个内置特性：
- 路由与懒加载组件: `<Link>` (通过引入 `next/link`)
- 修改`<head>`的组件: `<Head>` (通过引入 `next/head`)

如果你想写共用组件，可以嵌入Next.js应用和React应用中，推荐使用`create-react-app`。你可以更改`import`保持代码清晰。


</details>

<details>
  <summary>怎么解决css嵌入js问题?</summary>

Next.js bundles [styled-jsx](https://github.com/zeit/styled-jsx) supporting scoped css. However you can use any CSS-in-JS solution in your Next app by just including your favorite library [as mentioned before](#css-in-js) in the document.
Next.js自带[styled-jsx](https://github.com/zeit/styled-jsx)库支持css嵌入js。而且你可以选择其他嵌入方法到你的项目中，可参考文档[as mentioned before](#css-in-js)。

</details>

<details>
  <summary>What syntactic features are transpiled? How do I change them?</summary>

We track V8. Since V8 has wide support for ES6 and `async` and `await`, we transpile those. Since V8 doesn’t support class decorators, we don’t transpile those.

See [this](https://github.com/zeit/next.js/blob/master/server/build/webpack.js#L79) and [this](https://github.com/zeit/next.js/issues/26)

</details>

<details>
  <summary>Why a new Router?</summary>

Next.js is special in that:

- Routes don’t need to be known ahead of time
- Routes are always lazy-loadable
- Top-level components can define `getInitialProps` that should _block_ the loading of the route (either when server-rendering or lazy-loading)

As a result, we were able to introduce a very simple approach to routing that consists of two pieces:

- Every top level component receives a `url` object to inspect the url or perform modifications to the history
- A `<Link />` component is used to wrap elements like anchors (`<a/>`) to perform client-side transitions

We tested the flexibility of the routing with some interesting scenarios. For an example, check out [nextgram](https://github.com/zeit/nextgram).

</details>

<details>
<summary>How do I define a custom fancy route?</summary>

We [added](#custom-server-and-routing) the ability to map between an arbitrary URL and any component by supplying a request handler.

On the client side, we have a parameter call `as` on `<Link>` that _decorates_ the URL differently from the URL it _fetches_.
</details>

<details>
<summary>How do I fetch data?</summary>

It’s up to you. `getInitialProps` is an `async` function (or a regular function that returns a `Promise`). It can retrieve data from anywhere.
</details>

<details>
  <summary>Can I use it with GraphQL?</summary>

Yes! Here's an example with [Apollo](./examples/with-apollo).

</details>

<details>
<summary>Can I use it with Redux?</summary>

Yes! Here's an [example](./examples/with-redux)
</details>

<details>
<summary>Can I use Next with my favorite Javascript library or toolkit?</summary>

Since our first release we've had **many** example contributions, you can check them out in the [examples](./examples) directory
</details>

<details>
<summary>What is this inspired by?</summary>

Many of the goals we set out to accomplish were the ones listed in [The 7 principles of Rich Web Applications](http://rauchg.com/2014/7-principles-of-rich-web-applications/) by Guillermo Rauch.

The ease-of-use of PHP is a great inspiration. We feel Next.js is a suitable replacement for many scenarios where you otherwise would use PHP to output HTML.

Unlike PHP, we benefit from the ES6 module system and every file exports a **component or function** that can be easily imported for lazy evaluation or testing.

As we were researching options for server-rendering React that didn’t involve a large number of steps, we came across [react-page](https://github.com/facebookarchive/react-page) (now deprecated), a similar approach to Next.js by the creator of React Jordan Walke.

</details>

<a id="contributing" style="display: none"></a>
## 贡献

可查看 [contributing.md](./contributing.md)

<a id="contributing" style="display: none"></a>
## 作者

- Arunoda Susiripala ([@arunoda](https://twitter.com/arunoda)) – [ZEIT](https://zeit.co)
- Tim Neutkens ([@timneutkens](https://twitter.com/timneutkens)) – [ZEIT](https://zeit.co)
- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – [ZEIT](https://zeit.co)
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – [ZEIT](https://zeit.co)
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – [ZEIT](https://zeit.co)
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project
