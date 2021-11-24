# Using `next start` with `target` not set to `server`

#### Why This Error Occurred

Next.js can only handle running a server when the `target` is set to `server` (this is the default value). A serverless build, for instance, has no handler for requests–this is usually implemented by a hosting provider.

#### Possible Ways to Fix It

Use a different handler than `next start` when testing a serverless **production** build, otherwise just use `next dev`.
