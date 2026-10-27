/** Reserved for off-main-thread warp on large crops (not wired yet). */
export type ImageWarpWorkerRequest = {
  sessionId: number
  mode: 'quad' | 'mesh'
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export type ImageWarpWorkerResponse = {
  sessionId: number
  width: number
  height: number
  pixels: Uint8ClampedArray
}
