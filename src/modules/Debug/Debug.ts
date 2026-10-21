import * as Messages from 'modules/Messages'

const state: {
  fpsTotal: number
  fpsCurrent: number
  fpsInterval: ReturnType<typeof setInterval> | false
  fpsStartLogTime: number
  fpsLastUpdateTime: number
} = {
  fpsTotal: 0,
  fpsCurrent: 0,
  fpsInterval: false,
  fpsStartLogTime: 0,
  fpsLastUpdateTime: 0,
}

const updateFps = () => {
  const now = Date.now()
  const deltaTime = now - state.fpsLastUpdateTime
  if (deltaTime > 0) {
    Messages.update(`${Math.round(state.fpsCurrent / (deltaTime / 1000))} fps`)
  }
  state.fpsCurrent = 0
  state.fpsLastUpdateTime = now
}

export const startFpsLog = () => {
  state.fpsTotal = state.fpsCurrent = 0
  state.fpsLastUpdateTime = Date.now()
  if (state.fpsInterval) clearInterval(state.fpsInterval)
  state.fpsInterval = setInterval(updateFps, 1000)
}

let countedThisFrame = false
let frameResetId = 0

export const logFps = () => {
  if (countedThisFrame) return
  countedThisFrame = true
  state.fpsCurrent += 1
  state.fpsTotal += 1
  if (state.fpsTotal === 1) {
    state.fpsStartLogTime = Date.now()
  }
  if (!frameResetId) {
    frameResetId = requestAnimationFrame(() => {
      frameResetId = 0
      countedThisFrame = false
    })
  }
}

export const stopFpsLog = () => {
  state.fpsTotal = state.fpsCurrent = 0
  state.fpsLastUpdateTime = 0
  countedThisFrame = false
  if (frameResetId) cancelAnimationFrame(frameResetId)
  frameResetId = 0
  if (state.fpsInterval) clearInterval(state.fpsInterval)
  state.fpsInterval = false
}
