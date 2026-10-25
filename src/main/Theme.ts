import Params from 'main/Params'
import { colors } from './Colors'

export const spacing: Record<string, any> = {
  // GLOBAL
  ONE_REM: 10,
  ONE_CM_SIZE: '1.375',
  PHONE_LANDSCAPE_PADDING: 3,
  APP_MARGIN_BOTTOM: 2.5,

  // HEADER
  HEADER_HEIGHT: 5.5,
  DESKTOP_HEADER_BUTTON_WIDTH: 6.5,
  MOBILE_HEADER_BUTTON_WIDTH: 4.5,
  HEADER_BUTTON_WIDTH: 0,

  // EDITOR
  EDITOR_TOOLS_WIDTH: 5.6,
  EDITOR_PAGE_MARGIN: 1,
  EDITOR_DOCK_GAP: 0.6,

  // color picker
  COLORPICKER_HEIGHT: 6.1,

  // ruler
  RULER_HEIGHT: 12,
}

export const timing: Record<string, string> = {
  FAST_FADE: '100ms',
  OPEN_MENU_TRANSITION: '350ms',
  FADE_TRANSITION: '250ms',
  SLIDE_TRANSITION: '250ms',
  OPTIONS_SHOW_TRANSITION: '500ms',
}

export const palette: Record<string, any> = {
  ...colors,
}

export const init = () => {
  spacing.RULER_HEIGHT = Params.iphone ? 9 : 12
  spacing.ONE_REM = 10 / Params.viewportScale
  spacing.ONE_CM_SIZE = `${1.375 / Params.viewportScale}cm`
  spacing.DESKTOP_HEADER_BUTTON_WIDTH = 6.5 * spacing.ONE_REM
  spacing.MOBILE_HEADER_BUTTON_WIDTH = 4.5 * spacing.ONE_REM
  spacing.PHONE_LANDSCAPE_PADDING = 3 * spacing.ONE_REM
  spacing.HEADER_BUTTON_WIDTH = Params.isPhone
    ? spacing.MOBILE_HEADER_BUTTON_WIDTH
    : spacing.DESKTOP_HEADER_BUTTON_WIDTH
  spacing.EDITOR_TOOLS_WIDTH = 5.6 * spacing.ONE_REM
  spacing.EDITOR_PAGE_MARGIN = 1 * spacing.ONE_REM
  spacing.EDITOR_DOCK_GAP = 0.6 * spacing.ONE_REM
  spacing.COLORPICKER_HEIGHT = 6.1 * spacing.ONE_REM
  spacing.RULER_HEIGHT *= spacing.ONE_REM
  spacing.HEADER_HEIGHT = 5.5 * spacing.ONE_REM

  if (Params.ipad || (Params.ios && Params.isInstalledWebapp)) {
    spacing.APP_MARGIN_BOTTOM = 2.5 * spacing.ONE_REM
  } else {
    spacing.APP_MARGIN_BOTTOM = 2.5 * spacing.ONE_REM * 0.3
  }
}
