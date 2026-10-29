export type JsxChild = Node | string | number | boolean | null | undefined | JsxChild[]

interface BaseDomAttributes<T extends HTMLElement = HTMLElement> {
  id?: string
  class?: string
  className?: string
  style?: string | Partial<Record<string, string | number>>
  title?: string
  tabIndex?: number
  role?: string
  draggable?: boolean | 'true' | 'false'
  hidden?: boolean
  ref?: (el: T) => void
  children?: JsxChild
  src?: string
  alt?: string
  href?: string
  target?: string
  rel?: string
  type?: string
  value?: string | number
  placeholder?: string
  name?: string
  disabled?: boolean
  checked?: boolean
  readOnly?: boolean
  min?: string | number
  max?: string | number
  maxLength?: string | number
  maxlength?: string | number
  step?: string | number
  width?: string | number
  height?: string | number
  viewBox?: string
  version?: string
  d?: string
  x?: string | number
  y?: string | number
  rx?: string | number
  ry?: string | number
  cx?: string | number
  cy?: string | number
  r?: string | number
  fill?: string
  stroke?: string
  [dataOrAriaAttr: `data-${string}`]: string | number | boolean | undefined
  [ariaAttr: `aria-${string}`]: string | number | boolean | undefined
}

export type ComponentFn<P = Record<string, unknown>> = (
  props: P & { children?: JsxChild }
) => HTMLElement | DocumentFragment

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = HTMLElement
    interface ElementChildrenAttribute {
      children: Record<string, unknown>
    }
    interface IntrinsicElements {
      div: BaseDomAttributes<HTMLDivElement>
      span: BaseDomAttributes<HTMLSpanElement>
      p: BaseDomAttributes<HTMLParagraphElement>
      a: BaseDomAttributes<HTMLAnchorElement>
      img: BaseDomAttributes<HTMLImageElement>
      button: BaseDomAttributes<HTMLButtonElement>
      input: BaseDomAttributes<HTMLInputElement>
      select: BaseDomAttributes<HTMLSelectElement>
      option: BaseDomAttributes<HTMLOptionElement> & {
        value?: string
        selected?: boolean
      }
      textarea: BaseDomAttributes<HTMLTextAreaElement> & {
        rows?: number
        autocomplete?: string
        autocapitalize?: string
        spellcheck?: boolean | 'true' | 'false'
      }
      label: BaseDomAttributes<HTMLLabelElement>
      canvas: BaseDomAttributes<HTMLCanvasElement>
      h1: BaseDomAttributes<HTMLHeadingElement>
      h2: BaseDomAttributes<HTMLHeadingElement>
      h3: BaseDomAttributes<HTMLHeadingElement>
      h4: BaseDomAttributes<HTMLHeadingElement>
      h5: BaseDomAttributes<HTMLHeadingElement>
      h6: BaseDomAttributes<HTMLHeadingElement>
      ul: BaseDomAttributes<HTMLUListElement>
      ol: BaseDomAttributes<HTMLOListElement>
      li: BaseDomAttributes<HTMLLIElement>
      section: BaseDomAttributes<HTMLElement>
      header: BaseDomAttributes<HTMLElement>
      footer: BaseDomAttributes<HTMLElement>
      nav: BaseDomAttributes<HTMLElement>
      main: BaseDomAttributes<HTMLElement>
      br: BaseDomAttributes<HTMLBRElement>
      hr: BaseDomAttributes<HTMLHRElement>
      strong: BaseDomAttributes<HTMLElement>
      em: BaseDomAttributes<HTMLElement>
      small: BaseDomAttributes<HTMLElement>
      form: BaseDomAttributes<HTMLFormElement>
      svg: BaseDomAttributes<HTMLElement>
      path: BaseDomAttributes<HTMLElement>
      rect: BaseDomAttributes<HTMLElement>
      text: BaseDomAttributes<HTMLElement>
      g: BaseDomAttributes<HTMLElement>
      circle: BaseDomAttributes<HTMLElement>
    }
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set(['svg', 'path', 'rect', 'text', 'g', 'circle', 'line', 'defs'])

const appendChildNode = (parent: Node, child: JsxChild): void => {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return
  }
  if (Array.isArray(child)) {
    for (const nested of child) {
      appendChildNode(parent, nested)
    }
    return
  }
  if (child instanceof Node) {
    parent.appendChild(child)
    return
  }
  parent.appendChild(document.createTextNode(String(child)))
}

export const Fragment = (
  props: { children?: JsxChild } | null,
  ...children: JsxChild[]
): DocumentFragment => {
  const frag = document.createDocumentFragment()
  if (props && props.children !== undefined) {
    appendChildNode(frag, props.children)
  }
  for (const child of children) {
    appendChildNode(frag, child)
  }
  return frag
}

export const h = (
  tag: string | ComponentFn<any>,
  props: Record<string, any> | null,
  ...children: JsxChild[]
): HTMLElement => {
  const safeProps = props || {}
  const mergedChildren =
    children.length > 0 ? children : safeProps.children !== undefined ? [safeProps.children] : []

  if (typeof tag === 'function') {
    return tag({ ...safeProps, children: mergedChildren }) as HTMLElement
  }

  const el =
    SVG_TAGS.has(tag) && typeof document.createElementNS === 'function'
      ? (document.createElementNS(SVG_NS, tag) as unknown as HTMLElement)
      : document.createElement(tag)
  let refFn: ((node: HTMLElement) => void) | undefined

  for (const [key, value] of Object.entries(safeProps)) {
    if (key === 'children' || value === undefined || value === null || value === false) {
      continue
    }
    if (key === 'ref' && typeof value === 'function') {
      refFn = value
      continue
    }
    if (key === 'class' || key === 'className') {
      if (value) {
        el.setAttribute('class', String(value))
      }
      continue
    }
    if (key === 'style') {
      if (typeof value === 'string') {
        el.setAttribute('style', value)
      } else if (typeof value === 'object') {
        for (const [styleKey, styleVal] of Object.entries(value)) {
          if (styleVal !== undefined && styleVal !== null) {
            if (styleKey.startsWith('--')) {
              el.style.setProperty(styleKey, String(styleVal))
            } else {
              ;(el.style as any)[styleKey] = String(styleVal)
            }
          }
        }
      }
      continue
    }
    if (value === true) {
      el.setAttribute(key, '')
      continue
    }
    el.setAttribute(key, String(value))
  }

  for (const child of mergedChildren) {
    appendChildNode(el, child)
  }

  if (refFn) {
    refFn(el)
  }

  return el
}
