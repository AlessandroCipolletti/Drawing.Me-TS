import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Params from 'main/Params'
import * as Messages from 'modules/Messages'
import * as NotSupported from 'pages/NotSupported'
import * as Info from 'pages/Info'
import * as Folder from 'pages/Folder'
import * as LocalDB from 'utils/localDbUtils'
import * as Coworking from 'modules/Coworking'
import { h, Fragment } from 'ui/jsx-runtime'
import { mount, unmount, createListenerScope } from 'ui/mount'
import { EditorView, EditorRefs } from 'pages/Editor/EditorView'
import { ToolbarView, ToolbarRefs } from 'pages/Editor/components/Toolbar/ToolbarView'
import { ToolsView, ToolsRefs } from 'pages/Editor/components/Tools/ToolsView'
import {
  CustomBrushModalView,
  CustomBrushModalRefs,
  getDefaultCustomBrushDraft,
} from 'pages/Editor/components/CustomBrush'
import {
  ColorPickerView,
  ColorPickerRefs,
} from 'pages/Editor/components/ColorPicker/ColorPickerView'
import { LayersView, LayersRefs } from 'pages/Editor/components/Layers/LayersView'
import { RulerView, RulerRefs } from 'pages/Editor/components/Ruler/RulerView'

class MiniClassList {
  private set = new Set<string>()
  constructor(private owner: MiniElement) {}
  private sync() {
    this.owner.attributes.set('class', Array.from(this.set).join(' '))
  }
  setFromString(str: string) {
    this.set.clear()
    str
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => this.set.add(c))
    this.sync()
  }
  add(...tokens: string[]) {
    tokens.forEach((t) => {
      if (t) this.set.add(t)
    })
    this.sync()
  }
  remove(...tokens: string[]) {
    tokens.forEach((t) => this.set.delete(t))
    this.sync()
  }
  contains(token: string) {
    return this.set.has(token)
  }
  toggle(token: string, force?: boolean) {
    const shouldHave = force !== undefined ? force : !this.set.has(token)
    if (shouldHave) this.set.add(token)
    else this.set.delete(token)
    this.sync()
    return shouldHave
  }
  toString() {
    return Array.from(this.set).join(' ')
  }
}

class MiniNode {
  nodeName = '#node'
  parentNode: MiniNode | null = null
  childNodes: MiniNode[] = []

  appendChild<T extends MiniNode>(child: T): T {
    if (child.nodeName === '#document-fragment') {
      const toMove = [...child.childNodes]
      child.childNodes = []
      for (const c of toMove) {
        this.appendChild(c)
      }
      return child
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child)
    }
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  removeChild<T extends MiniNode>(child: T): T {
    const idx = this.childNodes.indexOf(child)
    if (idx !== -1) {
      this.childNodes.splice(idx, 1)
      child.parentNode = null
    }
    return child
  }

  replaceChildren(...nodes: MiniNode[]) {
    for (const c of this.childNodes) {
      c.parentNode = null
    }
    this.childNodes = []
    for (const n of nodes) {
      this.appendChild(n)
    }
  }

  remove() {
    this.parentNode?.removeChild(this)
  }
}

class MiniTextNode extends MiniNode {
  constructor(public textContent: string) {
    super()
    this.nodeName = '#text'
  }
}

class MiniElement extends MiniNode {
  tagName: string
  classList: MiniClassList
  attributes = new Map<string, string>()
  style: Record<string, any> = {
    setProperty: (k: string, v: string) => {
      this.style[k] = v
    },
  }
  dataset: Record<string, string> = {}
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  scrollTop = 0
  scrollLeft = 0
  clientHeight = 600
  clientWidth = 800
  scrollHeight = 600
  scrollWidth = 800

  constructor(tagName: string) {
    super()
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    this.classList = new MiniClassList(this)
  }

  get className() {
    return this.classList.toString()
  }
  set className(val: string) {
    this.classList.setFromString(val || '')
  }

  get id() {
    return this.attributes.get('id') || ''
  }
  set id(val: string) {
    this.setAttribute('id', val)
  }

  private rawHtml = ''
  get innerHTML() {
    return this.rawHtml
  }
  set innerHTML(val: string) {
    this.rawHtml = val
    for (const c of this.childNodes) c.parentNode = null
    this.childNodes = []
    if (val) {
      parseHtmlInto(val, this)
    }
  }

  insertAdjacentHTML(_pos: string, html: string) {
    parseHtmlInto(html, this)
  }

  setAttribute(name: string, value: string) {
    const str = String(value)
    this.attributes.set(name, str)
    if (name === 'class') {
      this.classList.setFromString(str)
    } else if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
      this.dataset[camel] = str
    }
  }

  getAttribute(name: string): string | null {
    if (name === 'class') return this.classList.toString()
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  addEventListener(type: string, fn: any) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: any) {
    this.listeners.get(type)?.delete(fn)
  }

  animate(_keyframes: Keyframe[], _options?: KeyframeAnimationOptions) {
    const anim: any = {
      onfinish: undefined as (() => void) | undefined,
      commitStyles: () => {},
      cancel: () => {},
    }
    Promise.resolve().then(() => anim.onfinish?.())
    return anim
  }

  getBoundingClientRect() {
    return { left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600, x: 0, y: 0 }
  }

  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): MiniElement[] {
    const results: MiniElement[] = []
    const groups = selector.split(',').map((s) => s.trim())
    const visit = (node: MiniNode) => {
      for (const child of node.childNodes) {
        if (child instanceof MiniElement) {
          if (groups.some((g) => matchesCompoundSelector(child, g))) {
            results.push(child)
          }
          visit(child)
        }
      }
    }
    visit(this)
    return results
  }
}

function matchesSimpleSelector(el: MiniElement, sel: string): boolean {
  let rem = sel.trim()
  if (!rem) return false

  // Extract attribute selectors [attr="val"] or [attr]
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g
  let m: RegExpExecArray | null
  while ((m = attrRegex.exec(rem)) !== null) {
    const attrName = m[1]
    const attrVal = m[2]
    const actual = el.getAttribute(attrName)
    if (attrVal !== undefined ? actual !== attrVal : actual === null) {
      return false
    }
  }
  rem = rem.replace(attrRegex, '')

  // Extract IDs
  const idMatch = rem.match(/#([a-zA-Z0-9_-]+)/)
  if (idMatch && el.id !== idMatch[1]) return false
  rem = rem.replace(/#[a-zA-Z0-9_-]+/g, '')

  // Extract classes
  const classMatches = rem.match(/\.([a-zA-Z0-9_-]+)/g)
  if (classMatches) {
    for (const cls of classMatches) {
      if (!el.classList.contains(cls.slice(1))) return false
    }
  }
  rem = rem.replace(/\.[a-zA-Z0-9_-]+/g, '').trim()

  // Remaining is tag name
  if (rem && rem !== '*' && el.tagName !== rem.toUpperCase()) {
    return false
  }
  return true
}

function matchesCompoundSelector(el: MiniElement, selector: string): boolean {
  const parts = selector.trim().split(/\s+/)
  if (!matchesSimpleSelector(el, parts[parts.length - 1])) return false
  let curr: MiniNode | null = el.parentNode
  for (let i = parts.length - 2; i >= 0; i--) {
    while (curr instanceof MiniElement && !matchesSimpleSelector(curr, parts[i])) {
      curr = curr.parentNode
    }
    if (!(curr instanceof MiniElement)) return false
    curr = curr.parentNode
  }
  return true
}

const VOID_TAGS = new Set(['IMG', 'INPUT', 'BR', 'HR', 'META', 'LINK'])

function parseHtmlInto(html: string, root: MiniNode) {
  const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g
  const stack: MiniNode[] = [root]
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(html)) !== null) {
    const full = match[0]
    const tag = match[1]
    const attrStr = match[2] || ''
    const text = match[3]

    if (text !== undefined) {
      if (text.trim()) {
        stack[stack.length - 1].appendChild(new MiniTextNode(text))
      }
      continue
    }

    if (full.startsWith('</')) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const el = new MiniElement(tag)
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g
    let am: RegExpExecArray | null
    while ((am = attrRegex.exec(attrStr)) !== null) {
      el.setAttribute(am[1], am[2] ?? '')
    }
    stack[stack.length - 1].appendChild(el)

    const selfClosing = full.endsWith('/>') || VOID_TAGS.has(el.tagName)
    if (!selfClosing) {
      stack.push(el)
    }
  }
}

describe('Shell Pages Smoke Tests (Messages, NotSupported, Info, Folder)', () => {
  let origDocument: any
  let origHTMLElement: any
  let origNode: any
  let origRAF: any
  let pagesContainer: MiniElement

  beforeEach(() => {
    origDocument = (globalThis as any).document
    origHTMLElement = (globalThis as any).HTMLElement
    origNode = (globalThis as any).Node
    origRAF = (globalThis as any).requestAnimationFrame

    const docEl = new MiniElement('html')
    const body = new MiniElement('body')
    docEl.appendChild(body)
    pagesContainer = new MiniElement('div')
    pagesContainer.className = 'drawith__pages-container'
    body.appendChild(pagesContainer)

    ;(globalThis as any).Node = MiniNode
    ;(globalThis as any).HTMLElement = MiniElement
    ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    }
    ;(globalThis as any).document = {
      documentElement: docEl,
      body,
      location: { origin: 'http://localhost:5173', pathname: '/' },
      createElement: (tag: string) => new MiniElement(tag),
      createTextNode: (text: string) => new MiniTextNode(text),
      createDocumentFragment: () => {
        const frag = new MiniNode()
        frag.nodeName = '#document-fragment'
        return frag
      },
      querySelector: (sel: string) => docEl.querySelector(sel),
      querySelectorAll: (sel: string) => docEl.querySelectorAll(sel),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    Params.pagesContainer = pagesContainer as unknown as HTMLElement
    Params.mainContainer = body as unknown as HTMLElement
  })

  afterEach(() => {
    ;(globalThis as any).document = origDocument
    ;(globalThis as any).HTMLElement = origHTMLElement
    ;(globalThis as any).Node = origNode
    ;(globalThis as any).requestAnimationFrame = origRAF
    vi.restoreAllMocks()
  })

  it('mounts and unmounts vanilla JSX views and cleans up listener scopes', () => {
    let capturedRef: HTMLElement | null = null
    let clicks = 0
    const scope = createListenerScope()

    const frag = Fragment(
      null,
      h(
        'div',
        {
          class: 'test__card',
          'data-id': '99',
          style: { '--custom-var': '12px', width: '100px' },
          ref: (el: HTMLElement) => {
            capturedRef = el
          },
        },
        h('span', { class: 'test__label' }, 'Hello JSX')
      )
    )

    const mounted = mount(pagesContainer as unknown as HTMLElement, frag)
    expect(capturedRef).not.toBeNull()
    expect(pagesContainer.querySelector('.test__card')?.getAttribute('data-id')).toBe('99')

    scope.on(mounted, 'pointerdown', () => {
      clicks++
    })
    expect((mounted as unknown as MiniElement).listeners.get('pointerdown')?.size).toBe(1)

    unmount(mounted, scope)
    expect((mounted as unknown as MiniElement).listeners.get('pointerdown')?.size).toBe(0)
    expect(pagesContainer.querySelector('.test__card')).toBeNull()
    expect(clicks).toBe(0)
  })

  it('mounts Messages and handles info/update calls without crashing', async () => {
    await Messages.init()
    expect(pagesContainer.querySelector('.messages__container')).not.toBeNull()
    expect(pagesContainer.querySelector('.messages__overlay')).not.toBeNull()

    Messages.update('Saving...')
    expect(pagesContainer.querySelector('.messages__update')?.innerHTML).toContain('Saving...')
  })

  it('mounts and closes NotSupported page cleanly', async () => {
    await NotSupported.open()
    expect(pagesContainer.querySelector('.notSupported__container')).not.toBeNull()
    expect((globalThis as any).document.body.classList.contains('drawith__NOT_SUPPORTED')).toBe(
      true
    )
    await NotSupported.close()
  })

  it('mounts Info page, selects about-us tab, and closes cleanly', async () => {
    await Info.open()
    const infoContainer = pagesContainer.querySelector('.drawith__info')
    expect(infoContainer).not.toBeNull()
    const selectedTab = infoContainer?.querySelector('div[data-tab-id="about-us"]')
    expect(selectedTab?.classList.contains('selected')).toBe(true)
    await Info.close()
  })

  it('mounts Folder page, renders saved drawings, and closes cleanly', async () => {
    vi.spyOn(LocalDB, 'getAllLocalDrawings').mockResolvedValue([
      { localDbId: 42, title: 'My Portrait', preview: 'data:image/png;base64,AAA', state: 1 },
    ])
    vi.spyOn(Coworking, 'completePendingCoworkerJoinIfNeeded').mockResolvedValue(undefined)

    await Messages.init()
    await Folder.open()

    expect(pagesContainer.querySelector('.folder__container')).not.toBeNull()
    const card = pagesContainer.querySelector('.folder__drawing[data-local-id="42"]')
    expect(card).not.toBeNull()
    expect(card?.querySelector('.folder__drawing-menu-btn')).not.toBeNull()
    expect(card?.querySelector('[data-menu-action="rename"]')).not.toBeNull()
    expect(card?.querySelector('[data-menu-action="duplicate"]')).not.toBeNull()
    expect(card?.querySelector('[data-menu-action="delete"]')).not.toBeNull()
    expect((globalThis as any).document.body.classList.contains('drawith__FOLDER-OPEN')).toBe(true)

    await Folder.close()
    expect((globalThis as any).document.body.classList.contains('drawith__FOLDER-OPEN')).toBe(false)
  })

  it('mounts Editor and Editor chrome JSX views (Toolbar, Tools, ColorPicker, Layers, Ruler) and populates refs', () => {
    const editorRefs = {} as EditorRefs
    mount(pagesContainer as unknown as HTMLElement, EditorView({ refs: editorRefs }))
    expect(editorRefs.container).not.toBeNull()
    expect(editorRefs.canvasContainer).not.toBeNull()
    expect(editorRefs.canvasForLine).not.toBeNull()

    const toolbarRefs = {} as ToolbarRefs
    mount(editorRefs.container!, ToolbarView({ refs: toolbarRefs }))
    expect(toolbarRefs.container).not.toBeNull()
    expect(toolbarRefs.slider).not.toBeNull()
    expect(toolbarRefs.toolPreviewCanvas).not.toBeNull()

    const toolsRefs: ToolsRefs = {
      toolsContainer: null,
      versionsContainer: null,
      toolsButtons: {},
      toolsVersions: {},
    }
    mount(
      editorRefs.container!,
      ToolsView({
        toolsData: [
          { name: 'marker', disabled: false, versions: [{ name: 'v1', props: {} }] },
          { name: 'customBrush', disabled: false, versions: [] },
          { name: 'undo', disabled: true, versions: false },
        ],
        refs: toolsRefs,
      })
    )
    expect(toolsRefs.toolsButtons.marker).toBeDefined()
    expect(toolsRefs.toolsButtons.customBrush).toBeDefined()
    expect(toolsRefs.toolsButtons.undo.classList.contains('disabled')).toBe(true)
    expect(toolsRefs.toolsVersions.marker).toBeDefined()
    expect(toolsRefs.toolsVersions.customBrush).toBeDefined()

    const customModalRefs: CustomBrushModalRefs = {
      root: null,
      paramsPane: null,
      previewPane: null,
      previewCanvas: null,
      resetPreviewBtn: null,
      frameButtons: {},
      fileInput: null,
      imageThumbWrap: null,
      imageThumbImg: null,
      reuploadImageBtn: null,
      redrawFrameBtn: null,
      sectionContainers: {},
      sectionBodies: {},
      sectionToggleHeaders: {},
      controls: {},
      deleteBtn: null,
      cancelBtn: null,
      saveBtn: null,
      frameEditor: {
        overlay: null,
        canvas: null,
        sizeSlider: null,
        sizeCursor: null,
        sizeValueLabel: null,
        opacitySlider: null,
        opacityCursor: null,
        opacityValueLabel: null,
        clearBtn: null,
        cancelBtn: null,
        saveBtn: null,
      },
    }
    mount(
      editorRefs.container!,
      CustomBrushModalView({
        mode: 'edit',
        brushNumber: 2,
        draft: getDefaultCustomBrushDraft(),
        refs: customModalRefs,
      })
    )
    expect(customModalRefs.root).not.toBeNull()
    expect(customModalRefs.previewCanvas).not.toBeNull()
    expect(customModalRefs.deleteBtn?.classList.contains('displayNone')).toBe(false)
    expect(customModalRefs.frameEditor.canvas).not.toBeNull()
    expect(customModalRefs.controls.size?.slider).not.toBeNull()
    expect(customModalRefs.controls.speedCurve?.slider).not.toBeNull()
    expect(customModalRefs.controls.useTimeBasedSpeed?.toggleEl).not.toBeNull()

    const colorPickerRefs = {} as ColorPickerRefs
    mount(
      editorRefs.container!,
      ColorPickerView({
        colors: [{ id: 1, initialHex: '#ff0000', brightness: 50, finalHex: '#ff0000' }],
        labels: {
          brightness: 'Brightness:',
          suggested: 'Suggested:',
        },
        refs: colorPickerRefs,
      })
    )
    expect(colorPickerRefs.colorPickerContainer).not.toBeNull()
    expect(colorPickerRefs.colorsContainer).not.toBeNull()

    const layersRefs = {} as LayersRefs
    mount(editorRefs.container!, LayersView({ maxLength: 12, refs: layersRefs }))
    expect(layersRefs.layersContainer).not.toBeNull()
    expect(layersRefs.layerListElement).not.toBeNull()
    expect(layersRefs.resizeButton).not.toBeNull()

    const rulerRefs = {} as RulerRefs
    mount(editorRefs.container!, RulerView({ refs: rulerRefs }))
    expect(rulerRefs.ruler).not.toBeNull()
    expect(rulerRefs.rulerLevelValue).not.toBeNull()
  })
})
