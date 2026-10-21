const appDirectoryPath = (pathname: string): string => {
  const pathOnly = pathname.split('?')[0].split('#')[0]
  const absolutePath = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
  return new URL('.', `http://local${absolutePath}`).pathname
}

/**
 * In-app route for a page opened from the domain root or any subdirectory.
 * The folder that contains index.html is ignored. A coworking code in `?S=`
 * still opens the session request.
 */
export const initialRouteFromLocation = (
  pathname: string,
  search: string,
  pageNames: ReadonlySet<string>
): string => {
  const directory = appDirectoryPath(pathname).toLowerCase()
  const pathOnly = (pathname.split('?')[0].split('#')[0] || '/').toLowerCase()
  const absolutePath = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`
  let relative = absolutePath.startsWith(directory)
    ? absolutePath.slice(directory.length)
    : absolutePath.slice(absolutePath.lastIndexOf('/') + 1)

  relative = relative.replace(/^index\.html/i, '').replace(/^\/+/, '')
  const parts = relative.split('/').filter(Boolean)
  const head = parts[0] || ''
  const routePath = !head || !pageNames.has(head) ? '/' : `/${parts.join('/')}`

  return applyInitialRouteQuery(routePath, search)
}

const applyInitialRouteQuery = (path: string, search: string): string => {
  const queryParams = new URLSearchParams(search)
  let url = path

  if (queryParams.get('S')) {
    url = `${url}/coworking/requestSession/${queryParams.get('S')}`.replace('//', '/')
  }

  if (url.endsWith('/editor') || url.endsWith('/editor/')) {
    url = url.replace('/editor', '/folder')
  }

  if (url.includes('/notSupported') || url.includes('/notsupported')) {
    url = '/folder'
  }

  return url
}
