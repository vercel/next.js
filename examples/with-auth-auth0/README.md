# Next.js with Auth0 example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-auth-auth0
cd with-auth-auth0
```

Add configuration:

* Create an account at Auth0 (https://auth0.com)
* Add your endpoints to your client's allowed urls like this ![](https://i.imgur.com/KmIc96g.png)
* Add your logout endpoint to your account allowed urls like this ![](https://i.imgur.com/5qZYSQ8.png)
* Copy the file `config.sample.json` at the root folder, rename it to `config.json` and add your Auth0 keys

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

This example shows how to implement authentication in next.js using Auth0

## Credits

This example was origionally built by [@luisrudge](https://github.com/luisrudge) here: [luisrudge/next.js-auth0](https://github.com/luisrudge/next.js-auth0)
And was later updated to reflect the changes in Next.js 2.0
