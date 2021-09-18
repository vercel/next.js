# No CSS Tags

### Why This Error Occurred

An HTML link element was used to link to an external stylesheet. This can negatively affect CSS resource loading on your web page.

### Possible Ways to Fix It

There are multiple ways to include styles using Next.js' built-in CSS support, including the option to use `@import` within the root stylesheet that is imported in `pages/_app.js`:

```css
/* Root stylesheet */
@import 'extra.css';

body {
  /* ... */
}
```

Another option is to use CSS Modules to import the CSS file scoped specifically to the component.

```jsx
import styles from './extra.module.css'

export class Home {
  render() {
    return (
      <div>
        <button type="button" className={styles.active}>
          Open
        </button>
      </div>
    )
  }
}
```

Refer to the [Built-In CSS Support](https://nextjs.org/docs/basic-features/built-in-css-support) documentation to learn about all the ways to include CSS to your application.
