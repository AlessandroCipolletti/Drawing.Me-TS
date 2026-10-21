import { describe, expect, it } from 'vitest'
import { initialRouteFromLocation } from 'modules/initialRoute'

const PAGES = new Set(['editor', 'folder', 'dashboard', 'coworking', 'notsupported', 'info'])

const route = (pathname: string, search = '') => initialRouteFromLocation(pathname, search, PAGES)

describe('initialRouteFromLocation', () => {
  it('opens the folder from the domain root and from index.html', () => {
    expect(route('/')).toBe('/')
    expect(route('/index.html')).toBe('/')
  })

  it('ignores any hosting subdirectory', () => {
    expect(route('/drawith/')).toBe('/')
    expect(route('/a/b/drawith/index.html')).toBe('/')
    expect(route('/workspace/drawithme/')).toBe('/')
  })

  it('keeps an in-app path that follows the hosting directory', () => {
    expect(route('/drawith/editor')).toBe('/folder')
    expect(route('/workspace/drawithme/dashboard')).toBe('/dashboard')
    expect(route('/apps/sketch/notsupported')).toBe('/folder')
  })

  it('starts a coworking session from ?S= in any directory', () => {
    expect(route('/drawith/', '?S=48291')).toBe('/coworking/requestSession/48291')
    expect(route('/a/b/index.html', '?S=abc')).toBe('/coworking/requestSession/abc')
    expect(route('/', '?S=1')).toBe('/coworking/requestSession/1')
  })
})
