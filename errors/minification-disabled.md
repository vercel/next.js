# Minification Disabled in Production

#### Why This Error Occurred

Code optimization has been disabled for your **production build**.
The `optimization.minimize` or `optimization.minimizer` was incorrectly overridden in `next.config.js`.

This severely degrades your application's performance at runtime. It can also result in server-side-only code being downloaded by your users.

#### Possible Ways to Fix It

Be sure your `next.config.js` has not modified `optimization.minimize` or `optimization.minimizer`.

You can file an issue on our GitHub if you do not understand why minification is being disabled by your `next.config.js`.
