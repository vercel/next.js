await Promise.resolve();

export const effects = [];

export function effect(name) {
  effects.push(name);
}
