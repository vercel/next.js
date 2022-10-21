import { AppRouterInstance } from '../../shared/lib/app-router-context'
import { NextRouter } from '../router'

export const HYBRID_ROUTER_TYPE = Symbol('HYBRID_ROUTER_TYPE')

type MaskedHybridRouter<T extends string, Router, OtherRouter> = {
  // Store the router type on the router via this private symbol.
  [HYBRID_ROUTER_TYPE]: T
} & Router &
  // Add partial fields of the other router so it's type-compatible with it, but
  // it will show those extra fields as undefined.
  Partial<Omit<OtherRouter, keyof Router>>

export type HybridRouter =
  | MaskedHybridRouter<'app', AppRouterInstance, NextRouter>
  | MaskedHybridRouter<'pages', NextRouter, AppRouterInstance>
