export interface ActionInfo {
  type: 'server-action' | 'use-cache'
  usedArgs: [boolean, boolean, boolean, boolean, boolean, boolean]
  hasRestArgs: boolean
}

/**
 * Extracts info about the server action for the given action ID by parsing the
 * first byte of the hex-encoded action ID.
 *
 * ```
 * Bit positions: [7]      [6] [5] [4] [3] [2] [1]  [0]
 * Bits:          typeBit  argMask                  restArgs
 * ```
 *
 * If the `typeBit` is `1` it represents a `"use cache"` function, otherwise a
 * server action.
 *
 * The `argMask` encodes whether the function uses the argument at the
 * respective position.
 *
 * The `restArgs` bit indicates whether the function uses a rest parameter.
 *
 * @param actionId hex-encoded server action ID
 */
export function extractInfoFromActionId(actionId: string): ActionInfo {
  // Bit positions: [7]      [6] [5] [4] [3] [2] [1]  [0]
  // Bits:          typeBit  argMask                  restArgs
  const infoByte = parseInt(actionId.slice(0, 2), 16)
  const typeBit = (infoByte >> 7) & 0x1
  const argMask = (infoByte >> 1) & 0x3f
  const restArgs = infoByte & 0x1
  const usedArgs = Array(6)

  for (let index = 0; index < 6; index++) {
    const bitPosition = 5 - index
    const bit = (argMask >> bitPosition) & 0x1
    usedArgs[index] = bit === 1
  }

  return {
    type: typeBit === 1 ? 'use-cache' : 'server-action',
    usedArgs: usedArgs as [
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
    ],
    hasRestArgs: restArgs === 1,
  }
}

/**
 * Creates a sparse array containing only the used arguments based on the
 * provided action info.
 */
export function filterActionArgs(
  args: unknown[],
  actionInfo: ActionInfo
): unknown[] {
  const filteredArgs = new Array(args.length)

  for (let index = 0; index < args.length; index++) {
    if (
      (index < 6 && actionInfo.usedArgs[index]) ||
      (index >= 6 && actionInfo.hasRestArgs)
    ) {
      filteredArgs[index] = args[index]
    }
  }

  return filteredArgs
}
