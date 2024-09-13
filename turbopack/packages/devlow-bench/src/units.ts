const UNITS: Record<string, Record<string, number>> = {
  ms: {
    " s": 1000,
  },
  bytes: {
    " GB": 1024 * 1024 * 1024,
    " MB": 1024 * 1024,
    " KB": 1024,
  },
  requests: {
    "K requests": 1000,
  },
};

export function formatUnit(value: number, unit: string) {
  const conversion = UNITS[unit];
  if (conversion) {
    for (const [name, factor] of Object.entries(conversion)) {
      if (value >= factor) {
        return `${(value / factor).toFixed(2)}${name}`;
      }
    }
  }
  return `${value.toFixed(2).replace(/\.00$/, "")} ${unit}`;
}
