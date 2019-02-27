# Using `next export` with `target` not set to `server`

#### Why This Error Occurred

Next.js can only handle exporting when the `target` is set to `server` (this is the default value). A serverless build, for instance, has no handler for requests–this is usually implemented by a hosting provider.

#### Possible Ways to Fix It

Change `target` to `server`, run `next build`, then run `next export` again.