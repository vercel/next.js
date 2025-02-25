export type DevIndicatorServerStateDisabled = {
  isDisabled: true
  disabledUntil: number
}

export type DevIndicatorServerStateEnabled = {
  isDisabled: false
}

export type DevIndicatorServerState =
  | DevIndicatorServerStateDisabled
  | DevIndicatorServerStateEnabled

export const devIndicatorServerState: DevIndicatorServerState = {
  isDisabled: false,
}
