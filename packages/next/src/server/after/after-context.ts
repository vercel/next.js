export interface AfterContext {}

export function createAfterContext(): AfterContext {
  return new AfterContextImpl()
}

export class AfterContextImpl implements AfterContext {}
