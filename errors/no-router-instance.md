# No Router Instance

#### Why This Error Occurred

During SSR you might have tried to access a router method `push`, `replace`, `back`, which is not supported. 

#### Possible Ways to Fix It

Move any calls to router methods to `componentDidMount` or add a check such as `typeof window !== 'undefined'` before calling the methods