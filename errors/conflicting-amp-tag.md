# Conflicting AMP Tag

#### Why This Error Occurred

In AMP mode Next.js adds certain necessary tags automatically to comply with the AMP standard. You added a tag using `next/head` that conflicts with one of these automatically added tags.

#### Possible Ways to Fix It

Remove the tag mentioned in the error message from any `<Head></Head>` elements
