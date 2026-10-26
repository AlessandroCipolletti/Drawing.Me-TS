import { h } from 'ui/jsx-runtime'
import { EditorRefs } from './editorTypes'

export type { EditorRefs }

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
    </div>
    <div
      class="editor-lasso__bar params-container displayNone"
      ref={(el) => {
        refs.lassoBar = el
      }}
    >
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
        data-lasso-action="transform"
        ref={(el) => {
          refs.lassoTransformButton = el
        }}
      >
        <div class="editor-lasso__action-icon svg-icon-move svg-icon-dark" />
        <span class="editor-lasso__action-label">Move</span>
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
  </div>
)
