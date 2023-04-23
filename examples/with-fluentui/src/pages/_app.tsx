import {
  createDOMRenderer,
  FluentProvider,
  GriffelRenderer,
  SSRProvider,
  RendererProvider,
  webLightTheme,
  webDarkTheme,
  Switch,
  SwitchOnChangeData,
} from '@fluentui/react-components'
import type { AppProps } from 'next/app'
import { ChangeEvent, useCallback, useState } from 'react'

type EnhancedAppProps = AppProps & { renderer?: GriffelRenderer }

function MyApp({ Component, pageProps, renderer }: EnhancedAppProps) {
  const [checked, setChecked] = useState(true)
  const onChange = useCallback(
    (ev: ChangeEvent<HTMLInputElement>, onChangeData: SwitchOnChangeData) => {
      setChecked(onChangeData.checked)
    },
    [setChecked]
  )

  return (
    // 👇 Accepts a renderer from <Document /> or creates a default one
    //    Also triggers rehydration a client
    <RendererProvider renderer={renderer || createDOMRenderer()}>
      <SSRProvider>
        <FluentProvider theme={checked ? webLightTheme : webDarkTheme}>
          <Switch
            checked={checked}
            onChange={onChange}
            label={checked ? 'Light Mode' : 'Dark Mode'}
          />
          <Component {...pageProps} />
        </FluentProvider>
      </SSRProvider>
    </RendererProvider>
  )
}

export default MyApp
