# Beta Middleware Used

#### Why This Error Occurred

[Middleware](https://nextjs.org/docs/advanced-features/middleware) was beta in versions prior to `v12.2` and not yet covered by [semver](https://semver.org/).

#### Possible Ways to Fix It

You can continue to use Middleware in versions prior to `v12.2`. However, you will need to make changes to upgrade to newer versions.

If you're using Next.js on Vercel, your existing deploys using Middleware will continue to work, and you can continue to deploy your site using Middleware. When you upgrade your site to `v12.2` or later, you will need to follow the [upgrade guide](https://nextjs.org/docs/messages/middleware-upgrade-guide).

### Useful Links

- [Middleware Upgrade Guide](https://nextjs.org/docs/messages/middleware-upgrade-guide)
