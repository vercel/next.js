# The key "<your key>" under "env" in next.config.js is not allowed.

#### Why This Error Occurred

Next.js configures internal variables for replacement itself. These start with `__` or `NODE_`, for this reason they are not allowed as values for `env` in `next.config.js`

#### Possible Ways to Fix It

Rename the specified key so that it does not start with `__` or `NODE_`.
