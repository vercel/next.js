import { useColorMode, Switch } from '@chakra-ui/react'
import { SunIcon, MoonIcon } from "@chakra-ui/icons"

export const DarkModeSwitch = () => {
  const { colorMode, toggleColorMode } = useColorMode()
  const isDark = colorMode === 'dark'
  return (
    <Switch
      position="fixed"
      top="1rem"
      right="1rem"
      colorScheme="green"
      isChecked={isDark}
      onChange={toggleColorMode}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </Switch>
  )
}
