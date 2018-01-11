# Redux-Observable example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-redux-observable with-redux-observable-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-redux-observable
cd with-redux-observable
```

Install it and run:

```bash
npm install
npm run dev
```


### The idea behind the example
Example is a page that renders information about Star-Wars characters. It fetches new character  
every 3 seconds having the initial character fetched on a server.

Example also uses `redux-logger` to log every action.

![demo page](demo.png)

The main problem with integrating Redux, Redux-Observable and Next.js is probably making initial requests
on a server. That's because it's not possible to wait until epics are resolved in `getInitialProps` hook. 

In order to have best of two worlds, we can extract request logic and use it separately. 
That's what `lib/api.js` is for. It keeps functions that return configured Observable for ajax request. 
You can notice that `fetchCharacter` method is used to get initial data in `pages/index.js` 
and also in `lib/reducer.js` within an epic.

Other than above, configuration is pretty the same as in 
[with-redux example](https://github.com/zeit/next.js/tree/canary/examples/with-redux)
and [redux-observable docs](https://redux-observable.js.org/). There is, however one important thing
to note, that we are not using `AjaxObservable` from `rxjs` library because it doesn't work on Node.
Because of this we use a library like [universal-rx-request](https://www.npmjs.com/package/universal-rx-request).

