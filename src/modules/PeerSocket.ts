import { Peer, DataConnection } from 'peerjs'
import { throttle, exponentialTimeout } from 'utils/jsUtils'

const CONFIRMED = 'confirmed'
const REFUSED = 'refused'

const config = {
  defaultMaxConcurrentConnections: 1,
  defaultPingInterval: 5000,
}

type EventName =
  | 'newConnection'
  | 'newConnectionFailed'
  | 'newConnectionRefused'
  | 'connectionClosed'
  | 'connectionError'
  | 'message'
  | 'online'
  | 'offline'
  | 'peerError'

interface PeerSocketOptions {
  host?: string
  port?: number
  path?: string
  debug?: boolean
  pingInterval?: number
  maxConcurrentConnections?: number
}

const MAX_BUFFERED_AMOUNT = 64 * 1024

class PeerSocket {
  connections: DataConnection[] = []
  connected = false
  online = false
  id: string | null = null

  #host = ''
  #port = 0
  #path = ''
  #debug = false
  #pingInterval = config.defaultPingInterval

  #peer: Peer | null = null
  #maxConcurrentConnections = 0
  #reconnectTimeout = false
  #reopenTimeout = false
  #outboundQueue: any[] = []
  #flushScheduled = false

  #eventsCallbacks: Record<EventName, Array<(...args: any[]) => void>> = {
    newConnection: [],
    newConnectionFailed: [],
    newConnectionRefused: [],
    connectionClosed: [],
    connectionError: [],
    message: [],
    online: [],
    offline: [],
    peerError: [],
  }

  constructor({
    host = '',
    port = 443,
    path = '/',
    debug = false,
    pingInterval = config.defaultPingInterval,
    maxConcurrentConnections = config.defaultMaxConcurrentConnections,
  }: PeerSocketOptions = {}) {
    this.#host = host
    this.#port = port
    this.#path = path
    this.#debug = debug
    this.#pingInterval = pingInterval
    this.#maxConcurrentConnections = maxConcurrentConnections
    this.#initWhenOnline()
  }

  on(event: EventName, callback: (...args: any[]) => void) {
    if (
      typeof event !== 'string' ||
      typeof callback !== 'function' ||
      !this.#eventsCallbacks[event]
    ) {
      return
    }

    this.#eventsCallbacks[event].push(callback)
  }

  sendMessage(message: any) {
    this.#outboundQueue.push(message)
    this.#scheduleFlush()
  }

  #scheduleFlush = () => {
    if (this.#flushScheduled) return
    this.#flushScheduled = true
    queueMicrotask(this.#flushOutboundQueue)
  }

  #flushOutboundQueue = () => {
    this.#flushScheduled = false
    if (!this.connections.length) {
      this.#outboundQueue = []
      return
    }
    while (this.#outboundQueue.length > 0) {
      const backedUp = this.connections.some(
        (conn) => (conn as any).dataChannel?.bufferedAmount > MAX_BUFFERED_AMOUNT
      )
      if (backedUp) {
        this.#flushScheduled = true
        setTimeout(this.#flushOutboundQueue, 8)
        return
      }
      const nextMessage = this.#outboundQueue.shift()
      for (let i = 0; i < this.connections.length; i++) {
        this.connections[i].send(nextMessage)
      }
    }
  }

  connectTo(peerId: string) {
    if (peerId === this.id) {
      console.error('cannot connect to yourself')
      return
    }

    if (this.connections.length >= this.#maxConcurrentConnections) {
      console.error('max concurrent connections reached')
      return
    }

    if (this.#peer) {
      this.#handleNewConnection(this.#peer.connect(peerId), false)
    }
  }

  disconnectFrom(peerId = this.connections[0]?.peer) {
    if (peerId) {
      const dataConnection = this.connections.find((conn) => conn.peer === peerId)

      if (dataConnection) {
        dataConnection.close()
      } else {
        console.error(`not connected to ${peerId}`)
      }
    }
  }

  #initWhenOnline = () => {
    if (navigator.onLine) {
      this.#initPeerConnection()
    } else {
      window.addEventListener('online', this.#initPeerConnection)
    }
  }

  #initPeerConnection = () => {
    window.removeEventListener('online', this.#initPeerConnection)
    this.#peer = new Peer({
      host: this.#host,
      port: this.#port,
      path: this.#path,
      pingInterval: this.#pingInterval,
      secure: true,
      debug: this.#debug ? 3 : 0,
    })

    this.#peer.on('open', this.#handlePeerOpen)
    this.#peer.on('close', this.#handlePeerClose)
    this.#peer.on('connection', (conn) => this.#handleNewConnection(conn, true))
    this.#peer.on('disconnected', this.#handlePeerDisconnect)
    this.#peer.on('error', throttle(this.#handlePeerError, 1000))
  }

  #confirmConnection = (conn: DataConnection) => {
    this.connections.push(conn)
    this.connected = true
    this.#eventsCallbacks.newConnection.forEach((callback) => callback())

    conn.on('close', () => this.#handleConnectionClosed(conn))
    conn.on('error', throttle(this.#handleConnectionError.bind(this, conn), 1000))
    if (conn.peerConnection) {
      conn.peerConnection.oniceconnectionstatechange = () => {
        if (conn.peerConnection.iceConnectionState === 'disconnected') {
          conn.close()
        }
      }
    }
  }

  #handleConnectionClosed = (closedConn?: DataConnection) => {
    if (closedConn) {
      this.connections = this.connections.filter((conn) => conn !== closedConn)
    }
    this.#removeClosedConnections()
    this.#eventsCallbacks.connectionClosed.forEach((callback) => callback())
  }

  #handleConnectionError = (conn: DataConnection, error: any) => {
    console.log('connection error', error)
    this.#eventsCallbacks.connectionError.forEach((callback) => callback())
    conn.close()
  }

  #handleNewConnection = (conn: DataConnection, isIncomingConnection = true) => {
    if (conn) {
      conn.on('open', () => {
        // Fix legacy bug: if max concurrent connections is already reached,
        // refuse the new incoming connection immediately without registering
        // data/close listeners that could interfere with the active session.
        if (this.connections.length >= this.#maxConcurrentConnections) {
          conn.send(REFUSED)
          setTimeout(() => {
            try {
              conn.close()
            } catch (_) {
              // ignore close errors on refused connection
            }
          }, 500)
          return
        }

        conn.on('data', this.#handleConnectionReceivedData.bind(this, conn))

        if (isIncomingConnection) {
          conn.send(CONFIRMED)
          this.#confirmConnection(conn)
        }
      })
    }
  }

  #handleConnectionReceivedData = (conn: DataConnection, data: any) => {
    if (data === REFUSED) {
      this.#eventsCallbacks.newConnectionRefused.forEach((callback) => callback())
      conn.close()
      return
    }
    if (data === CONFIRMED) {
      this.#confirmConnection(conn)
      return
    }

    this.#eventsCallbacks.message.forEach((callback) => callback(data))
  }

  #handleInternetOffline = () => {
    setTimeout(() => {
      if (!navigator.onLine) {
        this.#peer?.destroy()
      }
    }, 5000)
  }

  #handlePeerOpen = (id: string) => {
    this.id = id
    if (!this.online) {
      this.online = true
      this.#eventsCallbacks.online.forEach((callback) => callback(id))
      window.addEventListener('offline', this.#handleInternetOffline)
    }

    this.#reconnectTimeout = false
    this.#reopenTimeout = false
  }

  #handlePeerClose = () => {
    this.#eventsCallbacks.offline.forEach((callback) => callback(this.connected))
    this.connections = []
    this.connected = false
    this.online = false
    this.id = null
    window.removeEventListener('offline', this.#handleInternetOffline)

    if (navigator.onLine) {
      if (!this.#reopenTimeout && this.#reopenIfNeeded()) {
        exponentialTimeout(this.#reopenIfNeeded)
      }
    } else {
      this.#initWhenOnline()
    }
  }

  #handlePeerDisconnect = () => {
    this.online = false
    if (!this.#reconnectTimeout && this.#reconnectIfNeeded()) {
      exponentialTimeout(this.#reconnectIfNeeded)
    }
  }

  #handlePeerError = (e: any) => {
    if (e.type === 'peer-unavailable') {
      this.#eventsCallbacks.newConnectionFailed.forEach((callback) => callback())
    } else {
      console.log('peer error', e)
      this.#eventsCallbacks.peerError.forEach((callback) => callback(this.connected))
      this.#peer?.destroy()
    }
  }

  #reconnectIfNeeded = () => {
    if (this.#peer && this.#peer.disconnected && !this.#peer.destroyed) {
      this.#peer.reconnect()
      this.#reconnectTimeout = true
      return true
    }
    return false
  }

  #reopenIfNeeded = () => {
    if (this.#peer && this.#peer.destroyed) {
      this.#initPeerConnection()
      this.#reopenTimeout = true
      return true
    }
    return false
  }

  #removeClosedConnections = () => {
    this.connections = this.connections.filter(
      (conn) => !!conn.peerConnection && conn.open !== false
    )
    this.connected = Boolean(this.connections.length)
  }
}

export default PeerSocket
