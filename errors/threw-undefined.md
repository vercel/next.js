# Threw undefined in render

#### Why This Error Occurred

Somewhere in your code you `throw` an `undefined` value. Since this isn't a valid error there isn't a stack trace. We show this error instead to let you know what to look for.


#### Possible Ways to Fix It

Look in your pages and find where an error could be throwing `undefined`
