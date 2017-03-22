
# Firebase example

## How to use

First, create a new Firebase project and copy and paste the config that it provides
into firebaseConfig.js. For this example I've created a single database type called
"posts", you'll need to create that for it to work.

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-firebase
cd with-firebase
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

This example shows two things, how to authenticate and read and write data from Firebase. You can start
adding posts after logging in. Each post has it's own page.
