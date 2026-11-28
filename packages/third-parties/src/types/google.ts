declare global {
  interface Window {
    dataLayer?: Object[]
    [key: string]: any
  }
}

type JSONValue =
  | string
  | number
  | boolean
  | JSONValue[]
  | { [key: string]: JSONValue }

type GTMParamsBaseParams = {
  dataLayer?: { [key: string]: JSONValue }
  dataLayerName?: string
  auth?: string
  preview?: string
  nonce?: string
}

type GTMParamsWithId = GTMParamsBaseParams & {
  gtmId: string
  gtmScriptUrl?: string
}

type GTMParamsWithScriptUrl = GTMParamsBaseParams & {
  gtmId?: string
  gtmScriptUrl: string
}

export type GTMParams = GTMParamsWithId | GTMParamsWithScriptUrl

export type GAParams = {
  gaId: string
  dataLayerName?: string
  debugMode?: boolean
  nonce?: string
}

export type GoogleMapsEmbed = {
  height?: number | string
  width?: number | string
  mode: 'place' | 'view' | 'directions' | 'streetview' | 'search'
  apiKey: string
  style?: string
  allowfullscreen?: boolean
  loading?: 'eager' | 'lazy'
  q?: string
  id?: string
  center?: string
  zoom?: string
  maptype?: string
  language?: string
  region?: string
}

export type YouTubeEmbed = {
  height?: number
  width?: number
  videoid: string
  playlabel?: string
  params?: string
  style?: string
}

// https://developers.google.com/tag-platform/gtagjs/reference/events
type GAEventItemParam = {
  item_id: string
  item_name: string
  affiliation?: string
  coupon?: string
  discount?: number
  index?: number
  item_brand?: string
  item_category?: string
  item_category2?: string
  item_category3?: string
  item_category4?: string
  item_category5?: string
  item_list_id?: string
  item_list_name?: string
  item_variant?: string
  location_id?: string
  price?: number
  quantity?: number
  [key: string]: any
}

export type GARecommendedEventParams = {
  // Online Sales
  add_payment_info: {
    currency: string
    value: number
    coupon?: string
    payment_type?: string
    items: GAEventItemParam[]
  }
  add_shipping_info: {
    currency: string
    value: number
    coupon?: string
    shipping_tier?: string
    items: GAEventItemParam[]
  }
  add_to_cart: {
    currency: string
    value: number
    items: GAEventItemParam[]
  }
  add_to_wishlist: {
    currency: string
    value: number
    items: GAEventItemParam[]
  }
  begin_checkout: {
    currency: string
    value: number
    coupon?: string
    items: GAEventItemParam[]
  }
  purchase: {
    currency: string
    value: number
    transaction_id: string
    customer_type?: string
    coupon?: string
    shipping?: number
    tax?: number
    items: GAEventItemParam[]
  }
  refund: {
    currency: string
    transaction_id: string
    value: number
    coupon?: string
    shipping?: number
    tax?: number
    items?: GAEventItemParam[]
  }
  remove_from_cart: {
    currency: string
    value: number
    items: GAEventItemParam[]
  }
  select_item: {
    item_list_id?: string
    item_list_name?: string
    items: GAEventItemParam[]
  }
  select_promotion: {
    creative_name?: string
    creative_slot?: string
    promotion_id?: string
    promotion_name?: string
    items?: GAEventItemParam[]
  }
  view_cart: {
    currency: string
    value: number
    items: GAEventItemParam[]
  }
  view_item: {
    currency: string
    value: number
    items: GAEventItemParam[]
  }
  view_item_list: {
    currency: string
    item_list_id?: string
    item_list_name?: string
    items: GAEventItemParam[]
  }
  view_promotion: {
    creative_name?: string
    creative_slot?: string
    promotion_id?: string
    promotion_name?: string
    items: GAEventItemParam[]
  }
  // Lead Generation
  close_convert_lead: {
    currency: string
    value: number
  }
  close_unconvert_lead: {
    currency: string
    value: number
    unconvert_lead_reason?: string
  }
  disqualify_lead: {
    currency: string
    value: number
    disqualified_lead_reason?: string
  }
  generate_lead: {
    currency: string
    value: number
    lead_source?: string
  }
  qualify_lead: {
    currency: string
    value: number
  }
  working_lead: {
    currency: string
    value: number
    lead_status?: string
  }
  // Games
  level_end: {
    level_name?: string
    success?: boolean
  }
  level_start: {
    level_name?: string
  }
  level_up: {
    level?: number
    character?: string
  }
  post_score: {
    score: number
    level?: number
    character?: string
  }
  unlock_achievement: {
    achievement_id: string
  }
  // All Properties
  earn_virtual_currency: {
    virtual_currency_name?: string
    value?: number
  }
  exception: {
    description?: string
    fatal?: boolean
  }
  join_group: {
    group_id?: string
  }
  login: {
    method?: string
  }
  page_view: {
    page_location?: string
    client_id?: string
    language?: string
    page_encoding?: string
    page_title?: string
    user_agent?: string
  }
  search: {
    search_term: string
  }
  select_content: {
    content_type?: string
    content_id?: string
  }
  share: {
    method?: string
    content_type?: string
    item_id?: string
  }
  sign_up: {
    method?: string
  }
  spend_virtual_currency: {
    value: number
    virtual_currency_name: string
    item_name?: string
  }
  tutorial_begin: Record<string, never>
  tutorial_complete: Record<string, never>
  view_search_results: {
    search_term?: string
  }
}

export type GARecommendedEventName = keyof GARecommendedEventParams
