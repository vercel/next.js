# API Routes body size limited to 5mb

#### Why This Error Occurred

API routes are meant to respond quickly and are not intended to support responding with large globs of data. The size limit for responses is set to 5mb.

#### Possible Ways to Fix It

Limit your api route responses to less than 5mb. If you need to support sending large files to the client, you should consider using a dedicated media host for those assets. See link below for suggestions.

### Useful Links

[Bypass 5mb body size limit](https://vercel.com/support/articles/how-to-bypass-vercel-5mb-body-size-limit-serverless-functions?query=5mb#request-directly-from-the-source)
