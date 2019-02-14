type WebpackOutputProps = { client: any; server: any }

type WebpackOutputState = {
  client_loading: boolean
  server_loading: boolean

  client_messages: null | {
    errors?: string[] | null
    warnings?: string[] | null
  }
  server_messages: null | {
    errors?: string[] | null
    warnings?: string[] | null
  }
}
