declare global {
  interface Window {
    dataLayer?: Object[]
    [key: string]: any
  }
}

export type GTMParams = {
  gtmId: string
  dataLayer?: string[]
  dataLayerName?: string
  auth?: string
  preview?: string
}

export type GAParams = {
  gaId: string
  dataLayerName?: string
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
  [x: string]: any // can add item-scoped custom parameters
}

export type GARecommendedEventParams = {
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
  earn_virtual_currency: {
    virtual_currency_name?: string
    value?: number
  }
  exception: {
    description?: string
    fatal?: boolean
  }
  generate_lead: {
    currency: string
    value: number
  }
  join_group: {
    group_id?: string
  }
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
  post_score: {
    score: number
    level?: number
    character?: string
  }
  purchase: {
    currency: string
    value: number
    transaction_id: string
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
  search: {
    search_term: string
  }
  select_content: {
    content_type?: string
    content_id?: string
  }
  select_item: {
    item_list_id?: string
    item_list_name?: string
    // * The items array is expected to have a single element, representing the selected item. If multiple elements are provided, only the first element in items will be used. https://developers.google.com/tag-platform/gtagjs/reference/events#select_item
    items: [GAEventItemParam]
  }
  select_promotion: {
    creative_name?: string
    creative_slot?: string
    promotion_id?: string
    promotion_name?: string
    items?: GAEventItemParam[]
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
  //  tutorial begin has no parameters
  tutorial_begin: {}
  tutorial_complete: {}
  unlock_achievement: {
    achievement_id: string
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
    item_list_id?: string
    item_list_name?: string
    items: GAEventItemParam[]
  }
  view_promotion: {
    creative_name?: string
    creative_slot?: string
    promotion_id?: string
    promotion_name?: string
    // * The items array is expected to have a single element, representing the item associated with the promotion. If multiple elements are provided, only the first element in items will be used. https://developers.google.com/tag-platform/gtagjs/reference/events#view_promotion
    items: [GAEventItemParam]
  }
  view_search_results: {
    search_term?: string
  }
}

export type GARecommendedEventName = keyof GARecommendedEventParams
