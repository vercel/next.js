async function getMemoryFromParentInWorker() {
  await new Promise((r) => setTimeout(r, 200));
  // fake
  return new WebAssembly.Memory({ initial: 1 });
}

export const memory = await getMemoryFromParentInWorker();
