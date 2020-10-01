import React, { useEffect, useState } from "react"
import {
  TopBar,
  LeftMenu,
  DefaultHead,
  DefaultLayoutProps,
  ENV
} from "@bunred/bunadmin"
import { Box, Drawer } from "@material-ui/core"
import clsx from "clsx"
import { useTheme } from "@material-ui/core/styles"
import { Container, Fade, useMediaQuery } from "@material-ui/core"
import styles from "./styles"

export default function DefaultLayout(props: DefaultLayoutProps) {
  const { children, leftMenu } = props
  const theme = useTheme()
  const [open, setOpen] = React.useState(true)
  const phoneVertical = useMediaQuery("(max-width:640px)")
  const classes = styles({ drawerOpen: open, phoneVertical })
  const [NtCount, setNtCount] = useState<() => Promise<number>>()

  useEffect(() => {
    ;(async () => {
      if (!ENV.NOTIFICATION_PLUGIN) return
      const customNotificationPath = ENV.NOTIFICATION_PLUGIN
      const { NotificationTable, notificationCount } = await import(
        `../../plugins/${customNotificationPath}`
      )
      if (!NotificationTable || !notificationCount) return
      setNtCount(notificationCount)
    })()
  }, [])

  return (
    <div className={classes.root}>
      <DefaultHead />
      <TopBar menuClick={handleDrawerToggle} notificationCount={NtCount} />
      <nav aria-label="mailbox folders">
        <Drawer
          PaperProps={{
            elevation: 1
          }}
          variant="permanent"
          className={clsx(classes.drawer, {
            [classes.drawerOpen]: open,
            [classes.drawerClose]: !open
          })}
          classes={{
            paper: clsx({
              [classes.drawerOpen]: open,
              [classes.drawerClose]: !open
            })
          }}
          anchor={theme.direction === "rtl" ? "right" : "left"}
          ModalProps={{
            keepMounted: true // Better open performance on mobile.
          }}
        >
          <LeftMenu {...leftMenu} />
        </Drawer>
      </nav>
      <Container className={classes.content}>
        <Fade in>
          <Box boxShadow={1} className={classes.contentBox}>
            {children}
          </Box>
        </Fade>
      </Container>
    </div>
  )

  function handleDrawerToggle() {
    setOpen(!open)
  }
}
