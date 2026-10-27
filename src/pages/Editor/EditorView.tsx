import { h } from 'ui/jsx-runtime'
import { EditorRefs, TransformKind } from './editorTypes'
import { TRANSFORM_KIND_LABELS, TRANSFORM_KINDS } from './resizeTransformSession'

export type { EditorRefs }

const QUICK_SHAPE_VARIANT_ITEMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'line', label: 'Line' },
  { id: 'arc', label: 'Arc' },
  { id: 'polyline', label: 'Polyline' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'circle', label: 'Circle' },
  { id: 'rect', label: 'Rect' },
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'equilateral', label: 'Regular' },
  { id: 'quad', label: 'Quad' },
  { id: 'pentagon', label: 'Pentagon' },
  { id: 'regularPentagon', label: 'Regular' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'regularHexagon', label: 'Regular' },
  { id: 'freehand', label: 'Original' },
]

const setWarpBulletRef = (refs: EditorRefs, index: number, el: HTMLElement | null) => {
  if (!refs.resizeWarpBullets) refs.resizeWarpBullets = []
  refs.resizeWarpBullets[index] = el
}

export const EditorView = ({ refs }: { refs: EditorRefs }) => (
  <div
    class="editor__container displayNone"
    ref={(el) => {
      refs.container = el
    }}
  >
    <div
      class="editor__touch-layer"
      ref={(el) => {
        refs.touchLayer = el
      }}
    />
    <div
      class="editor__pipette-cursor displayNone"
      ref={(el) => {
        refs.pipetteCursor = el
      }}
    >
      <div
        class="editor__pipette-cursor-image"
        ref={(el) => {
          refs.pipetteBackground = el
        }}
      />
    </div>
    <div
      class="editor__canvas-container paper-white"
      ref={(el) => {
        refs.canvasContainer = el
      }}
    >
      <div
        class="editor__drag-box drag-border-box displayNone"
        ref={(el) => {
          refs.dragBox = el
        }}
      >
        <div
          class="dragBulletOrigins dragBulletOriginTL"
          ref={(el) => {
            refs.dragBulletOriginTL = el
          }}
        />
        <div
          class="dragBulletOrigins dragBulletOriginTR"
          ref={(el) => {
            refs.dragBulletOriginTR = el
          }}
        />
        <div
          class="dragBulletOrigins dragBulletOriginBL"
          ref={(el) => {
            refs.dragBulletOriginBL = el
          }}
        />
        <div
          class="dragBulletOrigins dragBulletOriginBR"
          ref={(el) => {
            refs.dragBulletOriginBR = el
          }}
        />
        <div
          class="dragBulletOrigins dragBulletOriginRT"
          ref={(el) => {
            refs.dragBulletOriginRT = el
          }}
        />
      </div>
      <div class="editor__magnetised-lines-container">
        <div
          class="editor__magnetised-line-x displayNone"
          ref={(el) => {
            refs.magnetisedLineX = el
          }}
        />
        <div
          class="editor__magnetised-line-y displayNone"
          ref={(el) => {
            refs.magnetisedLineY = el
          }}
        />
        <div
          class="editor__magnetised-line-r displayNone"
          ref={(el) => {
            refs.magnetisedLineR = el
          }}
        />
      </div>
      <div
        class="editor__tool-cursor displayNone"
        ref={(el) => {
          refs.toolCursor = el
        }}
      />
      <div
        class="editor__canvas-origin"
        ref={(el) => {
          refs.canvasOrigin = el
        }}
      />
      <div
        class="editor__canvas-center"
        ref={(el) => {
          refs.canvasCenter = el
        }}
      />
      <canvas
        class="editor__canvas-for-line"
        ref={(el) => {
          refs.canvasForLine = el
        }}
      />
      <canvas
        class="editor__lasso-canvas displayNone"
        ref={(el) => {
          refs.lassoCanvas = el
        }}
      />
      <canvas
        class="editor-guides__overlay displayNone"
        ref={(el) => {
          refs.guidesOverlay = el
        }}
      />
      <div
        class="dragBulletOrigins editor-guides__origin-anchor"
        ref={(el) => {
          refs.guidesOriginAnchor = el
        }}
      />
      <div
        class="dragBulletOrigins editor-guides__rotation-anchor"
        ref={(el) => {
          refs.guidesRotationAnchor = el
        }}
      />
    </div>
    <div
      class="editor-lasso__bar params-container displayNone"
      ref={(el) => {
        refs.lassoBar = el
      }}
    >
      <div
        class="editor-lasso__action"
        data-lasso-action="invert"
        ref={(el) => {
          refs.lassoInvertButton = el
        }}
      >
        <span class="editor-lasso__action-label">Invert</span>
      </div>
      <div class="editor-lasso__divider" />
      <div
        class="editor-lasso__action"
        data-lasso-action="move"
        ref={(el) => {
          refs.lassoMoveButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-move svg-icon-dark" />
        <span class="editor-lasso__action-label">Move</span>
      </div>
      <div
        class="editor-lasso__action"
        data-lasso-action="transform"
        ref={(el) => {
          refs.lassoTransformButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-expand svg-icon-dark" />
        <span class="editor-lasso__action-label">Resize</span>
      </div>
      <div
        class="editor-lasso__action"
        data-lasso-action="copy"
        ref={(el) => {
          refs.lassoCopyButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-copy-layer svg-icon-dark" />
        <span class="editor-lasso__action-label">Copy</span>
      </div>
      <div
        class="editor-lasso__action"
        data-lasso-action="cut"
        ref={(el) => {
          refs.lassoCutButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-cut-layer svg-icon-dark" />
        <span class="editor-lasso__action-label">Cut</span>
      </div>
      <div
        class="editor-lasso__action editor-lasso__action--danger"
        data-lasso-action="clear"
        ref={(el) => {
          refs.lassoClearButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-delete svg-icon-dark" />
        <span class="editor-lasso__action-label">Clear</span>
      </div>
      <div class="editor-lasso__divider" />
      <div
        class="editor-lasso__action editor-lasso__action--icon-only"
        data-lasso-action="cancel"
        ref={(el) => {
          refs.lassoCancelButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-close svg-icon-dark" />
      </div>
    </div>
    <canvas
      class="editor-resize__quad-overlay displayNone"
      ref={(el) => {
        refs.resizeQuadOverlay = el
      }}
    />
    <canvas
      class="editor-resize__mesh-overlay displayNone"
      ref={(el) => {
        refs.resizeMeshOverlay = el
      }}
    />
    <div
      class="editor-resize__bar params-container editor-lasso__bar displayNone"
      ref={(el) => {
        refs.resizeTransformBar = el
      }}
    >
      {TRANSFORM_KINDS.map((kind: TransformKind) => (
        <div
          class="editor-lasso__action"
          data-resize-transform={kind}
          ref={(el) => {
            if (!refs.resizeTransformKindButtons) {
              refs.resizeTransformKindButtons = {}
            }
            refs.resizeTransformKindButtons[kind] = el
          }}
        >
          <span class="editor-lasso__action-label">{TRANSFORM_KIND_LABELS[kind]}</span>
        </div>
      ))}
      <div class="editor-lasso__divider" />
      <div
        class="editor-lasso__action editor-lasso__action--icon-only"
        data-resize-action="done"
        title="Done"
        ref={(el) => {
          refs.resizeTransformDoneButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-close svg-icon-dark" />
      </div>
    </div>
    <div
      class="editor-quickshape__bar params-container displayNone"
      ref={(el) => {
        refs.quickShapeBar = el
      }}
    >
      {QUICK_SHAPE_VARIANT_ITEMS.map((item) => (
        <div
          class="editor-quickshape__action displayNone"
          data-quickshape-variant={item.id}
          ref={(el) => {
            if (!refs.quickShapeVariantButtons) {
              refs.quickShapeVariantButtons = {}
            }
            refs.quickShapeVariantButtons[item.id] = el
          }}
        >
          <span class="editor-quickshape__action-label">{item.label}</span>
        </div>
      ))}
      <div class="editor-lasso__divider" />
      <div
        class="editor-quickshape__action editor-quickshape__action--icon-only"
        data-quickshape-action="cancel"
        ref={(el) => {
          refs.quickShapeCancelButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-close svg-icon-dark" />
      </div>
    </div>
    <div
      class="dragBullet dragBulletTL displayNone"
      ref={(el) => {
        refs.dragBulletTL = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletT displayNone"
      ref={(el) => {
        refs.dragBulletT = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletTR displayNone"
      ref={(el) => {
        refs.dragBulletTR = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletL displayNone"
      ref={(el) => {
        refs.dragBulletL = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletR displayNone"
      ref={(el) => {
        refs.dragBulletR = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletBL displayNone"
      ref={(el) => {
        refs.dragBulletBL = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletB displayNone"
      ref={(el) => {
        refs.dragBulletB = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletBR displayNone"
      ref={(el) => {
        refs.dragBulletBR = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletRT displayNone"
      ref={(el) => {
        refs.dragBulletRT = el
      }}
    >
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 0, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 1, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 2, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 3, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 4, el)}>
      <div />
    </div>
    <div
      class="dragBullet dragBulletWarp dragBulletWarpInner displayNone"
      ref={(el) => setWarpBulletRef(refs, 5, el)}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletWarp dragBulletWarpInner displayNone"
      ref={(el) => setWarpBulletRef(refs, 6, el)}
    >
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 7, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 8, el)}>
      <div />
    </div>
    <div
      class="dragBullet dragBulletWarp dragBulletWarpInner displayNone"
      ref={(el) => setWarpBulletRef(refs, 9, el)}
    >
      <div />
    </div>
    <div
      class="dragBullet dragBulletWarp dragBulletWarpInner displayNone"
      ref={(el) => setWarpBulletRef(refs, 10, el)}
    >
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 11, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 12, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 13, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 14, el)}>
      <div />
    </div>
    <div class="dragBullet dragBulletWarp displayNone" ref={(el) => setWarpBulletRef(refs, 15, el)}>
      <div />
    </div>
    <div
      class="dragBullet editor-guides__origin-bullet displayNone"
      ref={(el) => {
        refs.guidesOriginBullet = el
      }}
    >
      <div />
    </div>
    <div
      class="dragBullet editor-guides__rotation-bullet displayNone"
      ref={(el) => {
        refs.guidesRotationBullet = el
      }}
    >
      <div />
    </div>
  </div>
)
