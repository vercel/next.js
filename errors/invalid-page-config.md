# Invalid Page / API Route Config

#### Why This Error Occurred

In one of your pages or API Routes you did `export const config` with an invalid value.

#### Possible Ways to Fix It

The page's config must be an object initialized directly when being exported and not modified dynamically.
The config object must only contains static constant literals without expressions.

<table>
<thead>
  <tr>
    <th>Not Allowed</th>
    <th>Allowed</th>
  </tr>
</thead>
<tbody>

<tr>
<td>

```js
// `config` should be an object
export const config = 'hello world'
```

</td>
<td>

```js
export const config = {}
```

</td>
</tr>

<tr>
<td>

```js
export const config = {}
// `config.amp` is defined after `config` is exported
config.amp = true

// `config.amp` contains a dynamic expression
export const config = {
  amp: 1 + 1 > 2,
}
```

</td>
<td>

```js
export const config = {
  amp: true,
}

export const config = {
  amp: false,
}
```

</td>
</tr>

<tr>
<td>

```js
// `config.runtime` contains a dynamic expression
export const config = {
  runtime: `node${'js'}`,
}
```

</td>
<td>

```js
export const config = {
  runtime: 'nodejs',
}
export const config = {
  runtime: `nodejs`,
}
```

</td>
</tr>

<tr>
<td>

```js
// Re-exported `config` is not allowed
export { config } from '../config'
```

</td>
<td>

```js
export const config = {}
```

</td>
</tr>

</tbody>
</table>

### Useful Links

- [Enabling AMP Support](https://nextjs.org/docs/advanced-features/amp-support/introduction)
- [API Middlewares](https://nextjs.org/docs/api-routes/api-middlewares)
- [Switchable Runtime](https://nextjs.org/docs/advanced-features/react-18/switchable-runtime)
