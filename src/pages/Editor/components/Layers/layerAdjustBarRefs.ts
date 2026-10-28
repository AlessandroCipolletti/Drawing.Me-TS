export type AdjustBarRefs = {
  adjustBar: HTMLElement | null
  adjustBarPicker: HTMLElement | null
  adjustBarEdit: HTMLElement | null
  adjustFilterHue: HTMLElement | null
  adjustFilterSaturation: HTMLElement | null
  adjustFilterBrightness: HTMLElement | null
  adjustFilterTemperature: HTMLElement | null
  adjustFilterCurve: HTMLElement | null
  adjustFilterBlur: HTMLElement | null
  adjustFilterSharpness: HTMLElement | null
  adjustBarClose: HTMLElement | null
  adjustBarBack: HTMLElement | null
  adjustBarReset: HTMLElement | null
  adjustBarFilterName: HTMLElement | null
  adjustSlider1Cell: HTMLElement | null
  adjustSlider1: HTMLElement | null
  adjustSlider1Cursor: HTMLElement | null
  adjustSlider1Label: HTMLElement | null
  adjustSlider2Cell: HTMLElement | null
  adjustSlider2: HTMLElement | null
  adjustSlider2Cursor: HTMLElement | null
  adjustSlider2Label: HTMLElement | null
}

export const adjustBarRefs: AdjustBarRefs = {
  adjustBar: null,
  adjustBarPicker: null,
  adjustBarEdit: null,
  adjustFilterHue: null,
  adjustFilterSaturation: null,
  adjustFilterBrightness: null,
  adjustFilterTemperature: null,
  adjustFilterCurve: null,
  adjustFilterBlur: null,
  adjustFilterSharpness: null,
  adjustBarClose: null,
  adjustBarBack: null,
  adjustBarReset: null,
  adjustBarFilterName: null,
  adjustSlider1Cell: null,
  adjustSlider1: null,
  adjustSlider1Cursor: null,
  adjustSlider1Label: null,
  adjustSlider2Cell: null,
  adjustSlider2: null,
  adjustSlider2Cursor: null,
  adjustSlider2Label: null,
}

export const registerAdjustBarRefs = (next: Partial<AdjustBarRefs>) => {
  Object.assign(adjustBarRefs, next)
}
