import { DEFAULT_TEXT_FONT_FAMILY } from './textSpec'

type TextFontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting' | 'comic'

export interface TextFontEntry {
  id: string
  label: string
  family: string
  category: TextFontCategory
  weights: readonly number[]
  italic: boolean
  local?: boolean
  file?: string
  remoteUrl?: string
}

export const TEXT_FONT_CATALOG: readonly TextFontEntry[] = [
  {
    id: 'poppins',
    label: 'Poppins',
    family: 'Poppins',
    category: 'sans',
    weights: [300, 400, 600, 700],
    italic: true,
    local: true,
  },
  {
    id: 'set-fire',
    label: 'Fire Rain',
    family: 'SetFireToTheRain',
    category: 'handwriting',
    weights: [400],
    italic: false,
    file: 'setFireToTheRain.ttf',
  },
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    category: 'sans',
    weights: [300, 400, 600, 700, 800],
    italic: true,
    file: 'Inter-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: 'Montserrat',
    category: 'sans',
    weights: [300, 400, 600, 700, 800],
    italic: true,
    file: 'Montserrat-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/montserrat/v29/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
  },
  {
    id: 'rubik',
    label: 'Rubik',
    family: 'Rubik',
    category: 'sans',
    weights: [300, 400, 600, 700],
    italic: true,
    file: 'Rubik-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/rubik/v28/iJWKBXyIfDnIV7nBrXw.woff2',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    family: 'Space Grotesk',
    category: 'sans',
    weights: [400, 600, 700],
    italic: false,
    file: 'SpaceGrotesk-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/spacegrotesk/v16/V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2',
  },
  {
    id: 'nunito',
    label: 'Nunito',
    family: 'Nunito',
    category: 'sans',
    weights: [300, 400, 600, 700, 800],
    italic: true,
    file: 'Nunito-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/nunito/v26/XRXV3I6Li01BKofINeaB.woff2',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    family: 'Oswald',
    category: 'display',
    weights: [300, 400, 600, 700],
    italic: false,
    file: 'Oswald-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/oswald/v53/TK3iWkUHHAIjg752GT8G.woff2',
  },
  {
    id: 'playfair',
    label: 'Playfair',
    family: 'Playfair Display',
    category: 'serif',
    weights: [400, 600, 700, 800],
    italic: true,
    file: 'PlayfairDisplay-Variable.woff2',
    remoteUrl:
      'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgA.woff2',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    family: 'Merriweather',
    category: 'serif',
    weights: [300, 400, 700],
    italic: true,
    file: 'Merriweather-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/merriweather/v30/u-440qyriQwlOrhSvowK_l5-fCZM.woff2',
  },
  {
    id: 'lora',
    label: 'Lora',
    family: 'Lora',
    category: 'serif',
    weights: [400, 600, 700],
    italic: true,
    file: 'Lora-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/lora/v35/0QIvMX1D_JOuMwr7Iw.woff2',
  },
  {
    id: 'cinzel',
    label: 'Cinzel',
    family: 'Cinzel',
    category: 'serif',
    weights: [400, 600, 700],
    italic: false,
    file: 'Cinzel-Variable.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/cinzel/v23/8vIJ7ww63mVu7gt79mT7.woff2',
  },
  {
    id: 'abril-fatface',
    label: 'Abril Fatface',
    family: 'Abril Fatface',
    category: 'display',
    weights: [400],
    italic: false,
    file: 'AbrilFatface-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/abrilfatface/v23/zOL64pLDlL1D99S8g8PtiKchq-dmjQ.woff2',
  },
  {
    id: 'bebas-neue',
    label: 'Bebas Neue',
    family: 'Bebas Neue',
    category: 'display',
    weights: [400],
    italic: false,
    file: 'BebasNeue-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2',
  },
  {
    id: 'righteous',
    label: 'Righteous',
    family: 'Righteous',
    category: 'display',
    weights: [400],
    italic: false,
    file: 'Righteous-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/righteous/v17/1cXxaUPXBpj2rGoU7C9WiHGF.woff2',
  },
  {
    id: 'fredoka',
    label: 'Fredoka',
    family: 'Fredoka',
    category: 'display',
    weights: [400, 600, 700],
    italic: false,
    file: 'Fredoka-Variable.woff2',
    remoteUrl:
      'https://fonts.gstatic.com/s/fredoka/v14/X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_B-i2yQag0-mac3O8SL8EemK.woff2',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    family: 'Pacifico',
    category: 'handwriting',
    weights: [400],
    italic: false,
    file: 'Pacifico-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/pacifico/v22/FwZY7-Qmy14u9lezJ-6H6Mk.woff2',
  },
  {
    id: 'caveat',
    label: 'Caveat',
    family: 'Caveat',
    category: 'handwriting',
    weights: [400, 600, 700],
    italic: false,
    file: 'Caveat-Variable.woff2',
    remoteUrl:
      'https://fonts.gstatic.com/s/caveat/v18/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9eIWpYQ.woff2',
  },
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    family: 'Dancing Script',
    category: 'handwriting',
    weights: [400, 600, 700],
    italic: false,
    file: 'DancingScript-Variable.woff2',
    remoteUrl:
      'https://fonts.gstatic.com/s/dancingscript/v25/If2RXTr6YS-zF4S-kcSWSVi_szLgiuE.woff2',
  },
  {
    id: 'satisfy',
    label: 'Satisfy',
    family: 'Satisfy',
    category: 'handwriting',
    weights: [400],
    italic: false,
    file: 'Satisfy-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/satisfy/v21/rP2Hp2yn6lkG50LoCZOIHQ.woff2',
  },
  {
    id: 'permanent-marker',
    label: 'Marker',
    family: 'Permanent Marker',
    category: 'comic',
    weights: [400],
    italic: false,
    file: 'PermanentMarker-Regular.woff2',
    remoteUrl:
      'https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cfw.woff2',
  },
  {
    id: 'bangers',
    label: 'Bangers',
    family: 'Bangers',
    category: 'comic',
    weights: [400],
    italic: false,
    file: 'Bangers-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/bangers/v24/FeVQS0BTqb0h60ACH55Q2A.woff2',
  },
  {
    id: 'comic-neue',
    label: 'Comic Neue',
    family: 'Comic Neue',
    category: 'comic',
    weights: [400, 700],
    italic: true,
    file: 'ComicNeue-Regular.woff2',
    remoteUrl: 'https://fonts.gstatic.com/s/comicneue/v8/4UaHrEJDsxBrF37olUeD96rp5w.woff2',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: 'JetBrains Mono',
    category: 'mono',
    weights: [400, 600, 700],
    italic: true,
    file: 'JetBrainsMono-Variable.woff2',
    remoteUrl:
      'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbv2o-flEEny0FZhsfKu5WU4xD-IQ-PuZJJXxfpAO-Lf1OQk6O4.woff2',
  },
]

const localFontModules = import.meta.glob<string>(
  ['../../../static/font/text/*.{woff2,woff,ttf,otf}', '../../../static/font/setFireToTheRain.ttf'],
  {
    eager: false,
    query: '?url',
    import: 'default',
  }
)

export type FontUrlImporter = () => Promise<string>

const loadedFamilies = new Set<string>([DEFAULT_TEXT_FONT_FAMILY])
const inflightLoads = new Map<string, Promise<boolean>>()
let customImporterOverrides: Record<string, FontUrlImporter> | null = null

export const setFontImporterOverridesForTest = (
  overrides: Record<string, FontUrlImporter> | null
) => {
  customImporterOverrides = overrides
}

export const resetLoadedFontsForTest = () => {
  loadedFamilies.clear()
  loadedFamilies.add(DEFAULT_TEXT_FONT_FAMILY)
  inflightLoads.clear()
}

export const findTextFontEntry = (familyOrId: string): TextFontEntry | undefined => {
  const needle = (familyOrId || '').trim().toLowerCase()
  return TEXT_FONT_CATALOG.find(
    (entry) => entry.id.toLowerCase() === needle || entry.family.toLowerCase() === needle
  )
}

export const isTextFontLoaded = (familyOrId: string): boolean => {
  const entry = findTextFontEntry(familyOrId)
  const family = entry?.family || familyOrId || DEFAULT_TEXT_FONT_FAMILY
  if (entry?.local || family === DEFAULT_TEXT_FONT_FAMILY) return true
  return loadedFamilies.has(family)
}

const resolveLocalImporter = (file: string | undefined): FontUrlImporter | null => {
  if (!file) return null
  if (customImporterOverrides && customImporterOverrides[file]) {
    return customImporterOverrides[file]
  }
  for (const [key, loader] of Object.entries(localFontModules)) {
    if (key.endsWith(`/${file}`) || key === file) {
      return loader
    }
  }
  return null
}

const loadGoogleFontStylesheetUrl = async (family: string): Promise<string | null> => {
  if (typeof fetch !== 'function') return null
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,400;0,700;1,400&display=swap`
  const response = await fetch(href)
  if (!response.ok) return null
  const css = await response.text()
  const match = css.match(/url\(([^)]+)\)/)
  if (!match?.[1]) return null
  return match[1].replace(/["']/g, '')
}

const registerFontFaceUrl = async (family: string, href: string): Promise<boolean> => {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    loadedFamilies.add(family)
    return true
  }
  const face = new FontFace(family, `url("${href}")`, {
    weight: '100 900',
    style: 'normal',
  })
  const loaded = await face.load()
  document.fonts.add(loaded)
  loadedFamilies.add(family)
  return true
}

export const ensureTextFontLoaded = async (familyOrId: string): Promise<boolean> => {
  const entry = findTextFontEntry(familyOrId)
  if (!entry || entry.local || entry.family === DEFAULT_TEXT_FONT_FAMILY) {
    loadedFamilies.add(entry?.family || DEFAULT_TEXT_FONT_FAMILY)
    return true
  }

  const family = entry.family
  if (loadedFamilies.has(family)) return true

  const existing = inflightLoads.get(family)
  if (existing) return existing

  const task = (async (): Promise<boolean> => {
    try {
      const localLoader = resolveLocalImporter(entry.file)
      if (localLoader) {
        try {
          const href = await localLoader()
          if (href) return await registerFontFaceUrl(family, href)
        } catch {
          // Fall through to the remote stylesheet.
        }
      }
      const googleHref = await loadGoogleFontStylesheetUrl(family)
      if (googleHref) return await registerFontFaceUrl(family, googleHref)
      if (entry.remoteUrl) return await registerFontFaceUrl(family, entry.remoteUrl)
      return false
    } catch {
      return false
    } finally {
      inflightLoads.delete(family)
    }
  })()

  inflightLoads.set(family, task)
  return task
}
