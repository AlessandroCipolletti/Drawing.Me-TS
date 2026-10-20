import Params from 'main/Params'
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

export let startFpsLog = () => {
  if (Params.debugMode) {
    startFpsLog = () => {
      state.fpsTotal = state.fpsCurrent = 0
      state.fpsLastUpdateTime = Date.now()
      state.fpsInterval = setInterval(updateFps, 1000)
    }
    startFpsLog()
  } else {
    startFpsLog = () => {}
  }
}

export let logFps = () => {
  if (Params.debugMode) {
    logFps = () => {
      state.fpsCurrent += 1
      state.fpsTotal += 1
      if (state.fpsTotal === 1) {
        state.fpsStartLogTime = Date.now()
      }
    }
    logFps()
  } else {
    logFps = () => {}
  }
}

export let stopFpsLog = () => {
  if (Params.debugMode) {
    stopFpsLog = () => {
      state.fpsTotal = state.fpsCurrent = 0
      state.fpsLastUpdateTime = 0
      if (state.fpsInterval) clearInterval(state.fpsInterval)
      state.fpsInterval = false
    }
    stopFpsLog()
  } else {
    stopFpsLog = () => {}
  }
}
