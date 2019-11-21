# generateBuildId did not return a string

#### Why This Error Occurred

The most common cause for this issue is a custom `next.config.js` with the `generateBuildId` method defined, but it does not return a string.

#### Possible Ways to Fix It

Always return a string from generateBuildId.
