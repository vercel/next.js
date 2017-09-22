[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/server-authentication-JWT)

# Server Authentication with JWT

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/server-authentication-JWT
cd server-authentication-JWT
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

## The idea behind the example

The main idea behind this example is to handle the sessions on the server, letting you
validate if the user is logged before the view is rendered, as you know or now you know to access to local storage on server render you must do `componenDidMount` so this example prevent the render before the validation.
[More info here](https://github.com/facebook/react/issues/9647)

### Sign
You can create you're own account until you Log Out (The user will not be save);
you can access using the next credentials

````
email: demo@demo.com
password: demo
````
