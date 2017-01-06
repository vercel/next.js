
# Feathers JS example

## How to use

Download the example (or clone the repo)[https://github.com/zeit/next.js.git]:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-feathersjs
cd with-feathersjs
```

Install it and run:

```bash
npm install
npm start
```

## The idea behind the example

This example demonstrates how *Next* can be used in combination with *Feathers JS*. This setup allows you to keep your application in one piece.
The *Feathers JS* server is started in *Next* `prepare()` promise just like the *custom server express* example.

Routes are defined in `./src/routes`.
Pages are located in `./pages`, at the root of the project like the default *Next* setup.
Components are located in `./front/components` but could have been anywhere.
The initialisation of the *Feathers* client library is done in `./front/lig/Feathers`