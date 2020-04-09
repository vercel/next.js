# ENOENT from getInitialProps

#### Why This Error Occurred

In one of your pages you threw an error with the code `ENOENT`, this was previously an internal feature used to trigger rendering the 404 page and should not be relied on.

#### Possible Ways to Fix It

Handle rendering the 404 state on the current page instead of throwing and trying to render a separate page.

### Useful Links

- [Google 404 Error Guide](https://developers.google.com/search/docs/guides/fix-search-javascript)
