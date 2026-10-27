import { describe, expect, it } from 'vitest'
import toolsConfigInit from 'pages/Editor/components/Tools/toolsConfig'
import { toolsImgs } from 'pages/Editor/components/Tools/toolsState'
import { getOneToolVersionCompleteProps } from 'pages/Editor/components/Tools/toolsPersistence'
import { shouldAdaptStrokeLine } from 'pages/Editor/editorUtils'
import { logarithmicValueToPerc } from 'utils/mathUtils'

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
      'kaleido-shards',
      'moon-phase',
      'ring-dash',
      'spiral-galaxy',
      'sparkle-cross',
      'worm-ribbon',
      'leaf-fall',
      'checker-glitch',
      'halftone-pop',
      'pressure-prism',
      'random-tilt-shard',
      'arrow-shard',
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

  it('opens every never-used brush version at 50% opacity and size', () => {
    const brush = toolsConfigInit().brush
    brush.versions.forEach((version, index) => {
      const resolved = getOneToolVersionCompleteProps('brush', index)
      expect(
        logarithmicValueToPerc(resolved.alpha, resolved.minAlpha, resolved.maxAlpha, 0),
        version.name
      ).toBe(50)
      expect(
        logarithmicValueToPerc(resolved.size, resolved.minSize, resolved.maxSize, 0),
        version.name
      ).toBe(50)
    })
  })

  it('paints random-placement versions straight to the layer, without line adaptation', () => {
    const brush = toolsConfigInit().brush
    const randomOnes = [
      'kaleido-shards',
      'spiral-galaxy',
      'sparkle-cross',
      'leaf-fall',
      'halftone-pop',
      'random-tilt-shard',
      'arrow-shard',
      'splatter',
    ]
    for (const name of randomOnes) {
      const index = brush.versions.findIndex((v) => v.name === name)
      const resolved = getOneToolVersionCompleteProps('brush', index)
      expect(resolved.maxSizeThatNeedsToAdaptLine, name).toBe(0)
      expect(shouldAdaptStrokeLine(resolved as never), name).toBe(false)
    }
    expect(
      shouldAdaptStrokeLine({
        size: 20,
        maxSizeThatNeedsToAdaptLine: 75,
        stampCount: 3,
      } as never)
    ).toBe(false)
    expect(shouldAdaptStrokeLine({ size: 20, maxSizeThatNeedsToAdaptLine: 75 } as never)).toBe(true)
  })
})
