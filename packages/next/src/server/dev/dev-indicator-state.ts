export type DevIndicatorDisabledState = {
  isDisabled: true
  disabledUntil: number
}

export type DevIndicatorServerStateEnabled = {
  isDisabled: false
}

export type DevIndicatorState =
  | DevIndicatorDisabledState
  | DevIndicatorServerStateEnabled

export const devIndicatorServerState: DevIndicatorState = {
  isDisabled: false,
}
