export let syncAdjustmentLayerDisplay: (layerId: string) => void = () => {}
export let invalidateAdjustmentsForTargetLayer: (targetLayerId: string) => void = () => {}

export const registerSyncAdjustmentLayerDisplay = (handler: (layerId: string) => void) => {
  syncAdjustmentLayerDisplay = handler
}

export const registerInvalidateAdjustmentsForTarget = (
  handler: (targetLayerId: string) => void
) => {
  invalidateAdjustmentsForTargetLayer = handler
}
