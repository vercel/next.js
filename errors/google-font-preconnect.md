# Google Font Preconnect

### Why This Error Occurred

A preconnect resource hint was not used with a request to the Google Fonts domain. Adding `preconnect` is recommended to initiate an early connection to the origin.

### Possible Ways to Fix It

Add `rel="preconnect"` to the Google Font domain `<link>` tag:

```jsx
<link rel="preconnect" href="https://fonts.gstatic.com" />
```

### Useful Links

- [Preconnect to required origins](https://web.dev/uses-rel-preconnect/)
