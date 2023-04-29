import RenderResult from '../render-result'

/**
 * Action Response is set to application/json for now, but could be changed in the future.
 */
export class ActionRenderResult extends RenderResult {
  constructor(response: string) {
    super(response, { contentType: 'application/json' })
  }
}
