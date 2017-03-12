# Next.js server-side benchmarks

## Installation

Follow the steps in [contributing.md](../contributing.md)

Both benchmarks use `ab`. So make sure you have that installed.

## Usage

Before running the test:

```
npm run start
```

Then run one of these tests:

- Stateless application which renders `<h1>My component!</h1>`. Runs 3000 http requests.
```
npm run bench:stateless
```

- Stateless application which renders `<li>This is row {i}</li>` 10.000 times. Runs 500 http requests.
```
npm run bench:stateless-big
```
