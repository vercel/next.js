let previousBodyPaddingRight: string | undefined
let previousBodyOverflowSetting: string | undefined

let activeLocks = 0

export function lock() {
  setTimeout(() => {
    if (activeLocks++ > 0) {
      return
    }

    const scrollBarGap =
      window.innerWidth - document.documentElement.clientWidth

    if (scrollBarGap > 0) {
      previousBodyPaddingRight = document.body.style.paddingRight
      document.body.style.paddingRight = `${scrollBarGap}px`
    }

    previousBodyOverflowSetting = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  })
}

export function unlock() {
  setTimeout(() => {
    if (activeLocks === 0 || --activeLocks !== 0) {
      return
    }

    if (previousBodyPaddingRight !== undefined) {
      document.body.style.paddingRight = previousBodyPaddingRight
      previousBodyPaddingRight = undefined
    }

    if (previousBodyOverflowSetting !== undefined) {
      document.body.style.overflow = previousBodyOverflowSetting
      previousBodyOverflowSetting = undefined
    }
  })
}
