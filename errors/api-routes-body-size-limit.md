# API Routes Body Size Limited to 4MB

#### Why This Error Occurred

API Routes are meant to respond quickly and are not intended to support responding with large amounts of data. The maximum size of responses is 4 MB.

#### Possible Ways to Fix It

Limit your API Route responses to less than 4 MB. If you need to support sending large files to the client, you should consider using a dedicated media host for those assets. See link below for suggestions.

### Useful Links

[Tips to avoid the 5 MB limit](https://vercel.com/support/articles/how-to-bypass-vercel-5mb-body-size-limit-serverless-functions)
