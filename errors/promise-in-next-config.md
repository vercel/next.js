# Promise In Next Config

#### Why This Error Occurred

A function in `next.config.js` returned a promise which is not supported in Next.js yet

#### Possible Ways to Fix It

Look in your `next.config.js` and make sure you aren't using any asynchronous functions. Also check that any plugins you are using aren't either. 
