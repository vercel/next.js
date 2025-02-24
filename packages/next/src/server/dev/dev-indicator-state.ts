export type DevIndicatorDisabledState = {
  isDisabled: true
  disabledUntil: number
}

export type DevIndicatorEnabledState = {
  isDisabled: false
}

export type DevIndicatorState =
  | DevIndicatorDisabledState
  | DevIndicatorEnabledState

export const devIndicatorState: DevIndicatorState = {
  isDisabled: false,
}
