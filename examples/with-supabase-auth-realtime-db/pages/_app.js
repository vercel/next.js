import { Auth } from '@supabase/ui'
import { supabase } from '../utils/initSupabase'
import './../style.css'

export default function MyApp({ Component, pageProps }) {
  return (
    <main className={'dark'}>
      <Auth.UserContextProvider supabaseClient={supabase}>
        <Component {...pageProps} />
      </Auth.UserContextProvider>
    </main>
  )
}
