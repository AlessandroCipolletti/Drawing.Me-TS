import { state, refs } from './layersState'
import { adjustBarRefs } from './layerAdjustBarRefs'
import { clearFloatingBarManualPosition } from '../../floatingFeatureBarLayout'
import { requestAdjustBarReposition } from './layerAdjustBarPosition'
import { beginAdjustPanelSession, finalizeAdjustPanelSession } from './layerAdjustmentCommit'

export type AdjustBarMode = 'picker' | 'edit'

export const setAdjustBarMode = (mode: AdjustBarMode | false) => {
  state.adjustBarMode = mode
  adjustBarRefs.adjustBarPicker?.classList.toggle('displayNone', mode !== 'picker')
  adjustBarRefs.adjustBarEdit?.classList.toggle('displayNone', mode !== 'edit')
}

export const revealAdjustBar = () => {
  state.adjustPanelOpen = true
  adjustBarRefs.adjustBar?.classList.remove('displayNone')
  requestAdjustBarReposition()
}

export const concealAdjustBar = () => {
  adjustBarRefs.adjustBar?.classList.add('displayNone')
  refs.adjustParamsButton?.classList.remove('selected')
}

export const closeAdjustPanel = (options?: { skipCommit?: boolean }) => {
  if (!options?.skipCommit && state.adjustPanelOpen) {
    void finalizeAdjustPanelSession()
  }
  state.adjustPanelOpen = false
  state.adjustBarMode = false
  state.adjustManualArmOff = false
  adjustBarRefs.adjustBar?.classList.add('displayNone')
  refs.adjustParamsButton?.classList.remove('selected')
  clearFloatingBarManualPosition('adjust')
}

export const setAdjustPanelOpen = (visible: boolean) => {
  state.adjustPanelOpen = visible
  adjustBarRefs.adjustBar?.classList.toggle('displayNone', !visible)
  refs.adjustParamsButton?.classList.toggle('selected', visible)
  if (visible) {
    beginAdjustPanelSession()
    requestAdjustBarReposition()
  }
}

export const onLayerParamsClosed = () => {}
