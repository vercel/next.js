declare const __turbopack_external_require__: (id: string) => any;
const jest = __turbopack_external_require__("jest-circus");

const uncaughtExceptions: string[] = [];
const unhandledRejections: string[] = [];

process.on("uncaughtException", (e) => {
  uncaughtExceptions.push(String(e));
});

process.on("unhandledRejection", (e) => {
  unhandledRejections.push(String(e));
});

export default async function run() {
  const jestResult = await jest.run();

  // Wait a full tick for unhandledRejection handlers to run -- a microtask is not sufficient.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    jestResult,
    uncaughtExceptions,
    unhandledRejections,
  };
}
