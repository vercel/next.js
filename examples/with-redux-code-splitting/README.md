
# Redux code splitting example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-redux-code-splitting
cd with-redux-code-splitting
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## Preview

![](https://media.giphy.com/media/l1BgR2WBLAwZK8eME/giphy.gif)

## The idea behind the example

In a more complex app there might be two kinds of states.

### 1. global-state

This state will persist even when a user changes routes. 
One example could be the some jwt reducer, that manages the authentication token of our app.

### 2. local-state

This state is route specific. We only need it for a specific route.
One example could be a form reducer that manages a contact form on the contact page.

Next.js already solves code splitting on route basis pretty well. Since local-state reducer are only needed on a specific route I makes sence to add them to the global redux state on demand.

Therefore we created a new static utility method for page components called `getLocalReducers`. This method merges local reducers into the state tree on demand.


