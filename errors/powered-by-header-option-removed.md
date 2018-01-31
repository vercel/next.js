# The poweredByHeader has been removed

#### Why This Error Occurred

Starting at Next.js version 5.0.0 the `poweredByHeader` option has been removed.

#### Possible Ways to Fix It

If you still want to remove `x-powered-by` you can use one of the custom-server examples.

And then manually remove the header using `res.removeHeader('x-powered-by')`

### Useful Links

- [Custom Server documentation + examples](https://github.com/zeit/next.js#custom-server-and-routing)
