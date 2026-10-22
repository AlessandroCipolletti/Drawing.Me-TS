export const initBurgerButton = (dom: HTMLElement) => {
  let isOpen = false

  const open = () => {
    isOpen = true
    dom.classList.add('menu-button-open')
  }

  const close = () => {
    isOpen = false
    dom.classList.remove('menu-button-open')
  }

  const toggle = () => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }

  dom.classList.remove('displayNone')

  return {
    open,
    close,
    toggle,
  }
}
