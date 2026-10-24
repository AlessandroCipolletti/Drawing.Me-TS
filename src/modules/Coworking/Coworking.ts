import { v4 as uuidv4 } from 'uuid'
import Params from 'main/Params'
import PeerSocket from 'modules/PeerSocket'
import { goToPage, openPageFolder, getCurrentPage } from 'app/navigation'
import { emitCoworkingEvent } from 'app/coworkingBus'
import * as Messages from 'modules/Messages'
import { delay } from 'utils/jsUtils'
import { editorEvents, SOCKET_CONNECTED_STATUS } from './constants'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { editorCoworkingPort, type CoworkerLayerPayload } from 'app/editorCoworkingPort'
import { measureCoworkingCanvasPxSizes } from 'pages/Editor/editorCanvasMetrics'
import type { StrokeSample } from 'utils/canvasUtils'
import {
  addCoworkerWaitingId,
  getCoworkerWaitingId,
  cleanCoworkerWaitingId,
} from 'utils/localDbUtils'

let peerClient: PeerSocket | null = null
const config = {
  maxConcurrentConnections: 1,
}
const state = {
  userId: uuidv4(),
  isOpen: false,
  connectedUserId: '',
  iAskedForCoworking: false,
  clientData: {
    userId: '',
    codeVersion: '' as string | number,
    deviceType: '',
    screenWidth: 0,
    screenHeight: 0,
    canvasWidth: 0,
    canvasHeight: 0,
  },
  coworkingData: {
    minCanvasWidth: 0,
    minCanvasHeight: 0,
  },
  isWaitingPeerConnection: false,
  waitingToConnectToSocketId: false as string | false,
  stepsBuffer: [] as any[],
}

const labels = {
  networkError: 'Network Error',
  coworkingClosed: 'Session closed',
  errorHimself: "You can't connect to yourself",
  alreadyConnected: 'You are already connected to someone',
  badCode: 'This code is not valid',
  coworkingStarted: 'Coworking session started!',
  userNotAvailable: 'Selected user is already connected with someone',
  coworkerNeedsToUpdate: 'Your coworker needs to update the app at the latest version',
  youNeedToUpdate: 'You need to update the app to connect with someone else',
}

export const isOnline = () => Boolean(peerClient?.online)
export const isOpen = () => Boolean(state.isOpen)
export const getSocketId = () => peerClient?.id || ''
export const getUserId = () => state.userId
export const getCoworkerUserId = () => state.connectedUserId
export const isHostingCoworking = () => state.isOpen && !state.iAskedForCoworking

let editorQueue: Promise<void> = Promise.resolve()

const editorPortReady = () => typeof editorCoworkingPort.getCanvasPxSizes === 'function'

const waitForEditorPort = async () => {
  let attempts = 0
  while (!editorPortReady()) {
    if (attempts++ > 100) return false
    await delay(100)
  }
  return true
}

const withEditor = (fn: () => unknown) => {
  const run = async () => {
    if (!(await waitForEditorPort())) return
    await fn()
  }
  editorQueue = editorQueue.then(run, run)
}

const receiveNewLayer = (layer: CoworkerLayerPayload) => {
  withEditor(async () => {
    await waitForEditorToBeReady()
    layer.minX = Infinity
    layer.minY = Infinity
    layer.maxX = -Infinity
    layer.maxY = -Infinity
    await editorCoworkingPort.addNewLayerFromCoworker(layer)
  })
}

const peerMessageHandlers: Record<string, (data: any) => void> = {
  [editorEvents.coworkingSteps]: (data) =>
    withEditor(() => editorCoworkingPort.drawCoworkingMultipleStepsData(data)),
  [editorEvents.newLayer]: (data) => receiveNewLayer(data.layer),
  [editorEvents.clientEnvironment]: (data) => checkCoworkerEnvironment(data),
  [editorEvents.selectedLayer]: (data) =>
    withEditor(() => editorCoworkingPort.selectCoworkerLayer(data.layerId)),
  [editorEvents.undo]: (data) => withEditor(() => editorCoworkingPort.doUndoForUser(data.userId)),
  [editorEvents.redo]: (data) => withEditor(() => editorCoworkingPort.doRedoForUser(data.userId)),
  [editorEvents.deleteLayer]: (data) =>
    withEditor(() =>
      editorCoworkingPort.deleteLayerFromCoworker(data.layerId, data.nextSelectedId)
    ),
  [editorEvents.renameLayer]: (data) =>
    withEditor(() => editorCoworkingPort.renameLayerFromCoworker(data.layerId, data.newName)),
  [editorEvents.duplicateLayer]: (data) =>
    withEditor(() => editorCoworkingPort.duplicateLayerFromCoworker(data.layerId, data.newId)),
  [editorEvents.mergeLayers]: (data) =>
    withEditor(() =>
      editorCoworkingPort.mergeLayersFromCoworker(data.layerOneId, data.layerTwoId, data.newLayerId)
    ),
  [editorEvents.opacityLayer]: (data) =>
    withEditor(() =>
      editorCoworkingPort.updateLayerOpacityFromCoworker(data.layerId, data.newValue, data.oldValue)
    ),
  [editorEvents.enableLayer]: (data) =>
    withEditor(() => editorCoworkingPort.enableLayerFromCoworker(data.layerId)),
  [editorEvents.disableLayer]: (data) =>
    withEditor(() => editorCoworkingPort.disableLayerFromCoworker(data.layerId)),
  [editorEvents.orderDragLayer]: (data) =>
    withEditor(() =>
      editorCoworkingPort.layerDragChangeFromCoworker(data.layerId, data.newOrder, data.oldOrder)
    ),
  [editorEvents.flipLayer]: (data) =>
    withEditor(() =>
      editorCoworkingPort.receiveFlipLayerFromCoworker(data.layerId, data.horizontally)
    ),
  [editorEvents.resizeLayer]: (data) =>
    withEditor(() =>
      editorCoworkingPort.receiveResizeLayerFromCoworker(
        data.layerId,
        data.x,
        data.y,
        data.w,
        data.h,
        data.r
      )
    ),
  [editorEvents.clearLayer]: (data) =>
    withEditor(() => editorCoworkingPort.clearLayerFromCoworker(data.layerId)),
  [editorEvents.transferLayer]: (data) =>
    withEditor(() => editorCoworkingPort.receiveLayerFromCoworker(data.layerId)),
}

const handlePeerMessage = (message: any) => {
  if (!message?.event) return
  peerMessageHandlers[message.event]?.(message.data)
}

export const sendDeleteLayer = (layerId: string, nextSelectedId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.deleteLayer,
    data: { layerId, nextSelectedId },
  })
}

export const sendRenameLayer = (layerId: string, newName: string) => {
  peerClient?.sendMessage({
    event: editorEvents.renameLayer,
    data: { layerId, newName },
  })
}

export const sendDuplicateLayer = (layerId: string, newId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.duplicateLayer,
    data: { layerId, newId },
  })
}

export const sendMergeDownLayer = (layerOneId: string, layerTwoId: string, newLayerId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.mergeLayers,
    data: { layerOneId, layerTwoId, newLayerId },
  })
}

export const sendOpacityLayer = (layerId: string, newValue: number, oldValue: number) => {
  peerClient?.sendMessage({
    event: editorEvents.opacityLayer,
    data: { layerId, newValue, oldValue },
  })
}

export const sendEnableLayer = (layerId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.enableLayer,
    data: { layerId },
  })
}

export const sendDisableLayer = (layerId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.disableLayer,
    data: { layerId },
  })
}

export const sendOrderDragLayer = (layerId: string, newOrder: number, oldOrder: number) => {
  peerClient?.sendMessage({
    event: editorEvents.orderDragLayer,
    data: { layerId, newOrder, oldOrder },
  })
}

export const sendFlipLayer = (layerId: string, horizontally: boolean) => {
  peerClient?.sendMessage({
    event: editorEvents.flipLayer,
    data: { layerId, horizontally },
  })
}

export const sendResizeLayer = (
  layerId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  peerClient?.sendMessage({
    event: editorEvents.resizeLayer,
    data: { layerId, x, y, w, h, r },
  })
}

export const sendClearLayer = (layerId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.clearLayer,
    data: { layerId },
  })
}

export const sendTransferLayer = (layerId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.transferLayer,
    data: { layerId },
  })
}

export const sendNewLayer = (layer: any) => {
  const {
    minX: _minX,
    minY: _minY,
    maxX: _maxX,
    maxY: _maxY,
    canvas: _canvas,
    history: _history,
    previewRef: _previewRef,
    ...cloned
  } = layer

  peerClient?.sendMessage({
    event: editorEvents.newLayer,
    data: { layer: cloned },
  })
}

export const sendUndo = () => {
  peerClient?.sendMessage({
    event: editorEvents.undo,
    data: { userId: state.userId },
  })
}

export const sendRedo = () => {
  peerClient?.sendMessage({
    event: editorEvents.redo,
    data: { userId: state.userId },
  })
}

export const sendSelectedLayer = (layerId: string) => {
  peerClient?.sendMessage({
    event: editorEvents.selectedLayer,
    data: { layerId },
  })
}

export const addStep = (step: StrokeSample) => {
  state.stepsBuffer.push(step)
}

export const clearSteps = () => {
  state.stepsBuffer = []
}

export const sendSteps = (layerId: string, tool: any) => {
  const stepsToSend = state.stepsBuffer
  state.stepsBuffer = []

  let clonedTool: any
  if (Array.isArray(tool)) {
    clonedTool = [...tool]
  } else if (tool && typeof tool === 'object') {
    clonedTool = { ...tool }
    delete clonedTool.frameImageFile
  } else {
    clonedTool = tool
  }

  peerClient?.sendMessage({
    event: editorEvents.coworkingSteps,
    data: {
      steps: stepsToSend,
      layerId,
      tool: clonedTool,
    },
  })
}

const startCoworkingSession = async (userId: string) => {
  state.isOpen = true
  state.connectedUserId = userId
  Messages.info(labels.coworkingStarted)
  const editorOptions = {
    coworkerId: userId,
    withCoworking: true,
    isHostingCoworking: !state.iAskedForCoworking,
    coworkingCanvasWidth: state.coworkingData.minCanvasWidth,
    coworkingCanvasHeight: state.coworkingData.minCanvasHeight,
  }

  goToPage(`/editor/open/false/${JSON.stringify(editorOptions)}`)
}

export const updateClientEnvironment = async () => {
  if (isOnline()) {
    const [canvasWidth, canvasHeight] = editorCoworkingPort.getCanvasPxSizes
      ? editorCoworkingPort.getCanvasPxSizes(true)
      : measureCoworkingCanvasPxSizes()
    state.clientData.userId = state.userId
    state.clientData.codeVersion = Params.appVersion
    state.clientData.deviceType = Params.deviceType
    state.clientData.canvasWidth = canvasWidth
    state.clientData.canvasHeight = canvasHeight
    state.clientData.screenWidth = Params.width
    state.clientData.screenHeight = Params.height
  }
}

const sendClientEnvironmentToCoworker = () => {
  peerClient?.sendMessage({
    event: editorEvents.clientEnvironment,
    data: state.clientData,
  })
}

const checkCoworkerEnvironment = (coworkerEnvironment: any) => {
  if (coworkerEnvironment.codeVersion !== state.clientData.codeVersion) {
    if (coworkerEnvironment.codeVersion < state.clientData.codeVersion) {
      Messages.info(labels.coworkerNeedsToUpdate)
    } else {
      Messages.info(labels.youNeedToUpdate)
    }
    return
  }

  state.coworkingData.minCanvasWidth = Math.min(
    coworkerEnvironment.canvasWidth,
    state.clientData.canvasWidth
  )
  state.coworkingData.minCanvasHeight = Math.min(
    coworkerEnvironment.canvasHeight,
    state.clientData.canvasHeight
  )

  startCoworkingSession(coworkerEnvironment.userId)
}

export const requestSession = (coworkerSocketId: string) => {
  if (!coworkerSocketId) {
    return
  }
  if (!isOnline()) {
    state.iAskedForCoworking = true
    state.waitingToConnectToSocketId = coworkerSocketId
    addCoworkerWaitingId(coworkerSocketId)
    if (getCurrentPage() !== 'folder') {
      openPageFolder()
    }
    return
  }
  if (isOpen()) {
    Messages.error(labels.alreadyConnected)
    return
  }
  if (coworkerSocketId === peerClient?.id) {
    Messages.error(labels.errorHimself)
    return
  }

  state.iAskedForCoworking = true
  cleanCoworkerWaitingId()
  peerClient?.connectTo(coworkerSocketId)
}

export const completePendingCoworkerJoinIfNeeded = async () => {
  if (!isOnline() || isOpen()) return
  const pendingId = state.waitingToConnectToSocketId || (await getCoworkerWaitingId())
  if (pendingId) {
    state.waitingToConnectToSocketId = false
    await cleanCoworkerWaitingId()
    requestSession(pendingId)
  }
}

export const stop = () => {
  if (isOpen()) {
    peerClient?.disconnectFrom()
  }
}

const handlePeerClientOnline = async (_id: string) => {
  state.isWaitingPeerConnection = false
  addGlobalStatus(SOCKET_CONNECTED_STATUS)
  await updateClientEnvironment()
  await completePendingCoworkerJoinIfNeeded()
}

const handlePeerClientOffline = (duringCoworkingSession: boolean) => {
  removeGlobalStatus(SOCKET_CONNECTED_STATUS)
  if (duringCoworkingSession) {
    Messages.error(labels.networkError)
  }
  if (getCurrentPage() === 'folder') {
    emitCoworkingEvent('closeFolderPopup', undefined)
  }
}

const handleNewConnection = () => {
  sendClientEnvironmentToCoworker()
}

const handleConnectionFailed = () => {
  Messages.error(labels.badCode)
  openPageFolder()
}

const handleConnectionRefused = () => {
  Messages.error(labels.userNotAvailable)
  openPageFolder()
}

const handleConnectionClosed = () => {
  Messages.info(labels.coworkingClosed)
  state.connectedUserId = ''
  state.isOpen = false
  state.iAskedForCoworking = false
}

const waitForEditorToBeReady = async () => {
  let attempts = 0
  const maxAttempts = 100

  while (getCurrentPage() !== 'editor' || !editorCoworkingPort.areLayersReady?.()) {
    if (attempts > maxAttempts) {
      throw new Error('waitForEditorToBeReady timeout')
    }
    attempts++
    await delay(100)
  }
}

export const init = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!isOnline() && !state.isWaitingPeerConnection) {
      state.isWaitingPeerConnection = true

      peerClient = new PeerSocket({
        host: Params.peerServerHost,
        port: Params.peerServerPort,
        path: Params.peerServerPath,
        pingInterval: Params.peerPingInterval,
        maxConcurrentConnections: config.maxConcurrentConnections,
      })

      peerClient.on('online', handlePeerClientOnline)
      peerClient.on('offline', handlePeerClientOffline)
      peerClient.on('newConnection', handleNewConnection)
      peerClient.on('message', handlePeerMessage)
      peerClient.on('newConnectionFailed', handleConnectionFailed)
      peerClient.on('newConnectionRefused', handleConnectionRefused)
      peerClient.on('connectionClosed', handleConnectionClosed)
    }
    resolve()
  })
}
