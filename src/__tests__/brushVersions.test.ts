import { describe, expect, it } from 'vitest'
import toolsConfigInit from 'pages/Editor/components/Tools/toolsConfig'
import { toolsImgs } from 'pages/Editor/components/Tools/toolsState'

describe('brush versions', () => {
  it('ships the original media-inspired stamps with registered frames', () => {
    const brush = toolsConfigInit().brush
    expect(brush.versions.length).toBeGreaterThanOrEqual(26)
    const newVersions = brush.versions.slice(11)
    expect(newVersions.map((v) => v.name)).toEqual([
      'oil-filbert',
      'oil-flat',
      'gouache-round',
      'gouache-dry',
      'watercolor-wash',
      'watercolor-bloom',
      'charcoal-block',
      'charcoal-willow',
      'pastel-oil',
      'crayon-wax',
      'dry-ink',
      'sable-point',
      'palette-knife',
      'splatter',
      'impasto-canvas',
    ])
    const gouacheRound = brush.versions.find((v) => v.name === 'gouache-round')
    expect(gouacheRound?.props.opaqueFramesAtMaxAlpha).toBe(true)
    expect(gouacheRound?.props.colorVariationMode).toBe('cycle')
    expect(gouacheRound?.props.colorCycleLengthPx).toBe(3000)
    expect(gouacheRound?.props.sizeForceFactor).toBe(0)
    expect(gouacheRound?.props.sizeSpeedFactor).toBe(0)
    expect(gouacheRound?.props.colorJitterHue).toBe(0)
    expect(gouacheRound?.props.colorJitterSat).toBe(0)
    expect(gouacheRound?.props.colorJitterLight).toBe(1)
    const gouacheDry = brush.versions.find((v) => v.name === 'gouache-dry')
    expect(gouacheDry?.props.colorVariationMode).toBe('random')
    expect(gouacheDry?.props.colorJitterHue).toBe(180)
    expect(gouacheDry?.props.colorJitterSat).toBe(1)
    expect(gouacheDry?.props.colorJitterLight).toBe(1)
    for (const version of brush.versions) {
      const frame = version.props.frameImageName
      expect(frame, version.name).toBeTruthy()
      expect(toolsImgs[String(frame)], version.name).toBeTruthy()
    }
  })
})
