import { h, Fragment } from 'ui/jsx-runtime'
import { ExtendedCanvasContext } from 'utils/canvasUtils'

export interface ToolbarRefs {
  container: HTMLElement | null
  params: HTMLElement | null
  leftSide: HTMLElement | null
  centerSide: HTMLElement | null
  rightSide: HTMLElement | null
  backButton: HTMLElement | null
  saveCopyButton: HTMLElement | null
  goFullscreenButton: HTMLElement | null
  slider: HTMLElement | null
  sliderLabel: HTMLElement | null
  sliderCursor: HTMLElement | null
  sizeButton: HTMLElement | null
  alphaButton: HTMLElement | null
  alphaIcon: HTMLElement | null
  sizeLabel: HTMLElement | null
  alphaLabel: HTMLElement | null
  toolPreview: HTMLElement | null
  toolPreviewPopup: HTMLElement | null
  toolPreviewCanvas: HTMLCanvasElement | null
  toolPreviewContext: ExtendedCanvasContext | null
}

const edgeIconOutlineOffsets = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

const EdgeIcon = ({ iconClass }: { iconClass: string }) => (
  <div class="editor-toolbar__edge-icon">
    {edgeIconOutlineOffsets.map((offset) => (
      <div
        class={`${iconClass} editor-toolbar__edge-icon-outline editor-toolbar__edge-icon-outline-${offset}`}
      />
    ))}
    <div class={`${iconClass} svg-icon-dark`} />
  </div>
)

export const ToolbarView = ({ refs }: { refs: ToolbarRefs }) => (
  <>
    <div
      class="editor-toolbar__edge-button editor__back"
      ref={(el) => {
        refs.backButton = el
      }}
    >
      <EdgeIcon iconClass="svg-icon-back-save" />
    </div>
    <div
      class="editor-toolbar__edge-button editor__go-fullscreen"
      ref={(el) => {
        refs.goFullscreenButton = el
      }}
    >
      <EdgeIcon iconClass="svg-icon-dynamic-editor-fullscreen" />
    </div>
    <div
      class="editor-toolbar__container"
      ref={(el) => {
        refs.container = el
      }}
    >
      <div
        class="editor-toolbar__left"
        ref={(el) => {
          refs.leftSide = el
        }}
      />

      <div
        class="editor-toolbar__center"
        ref={(el) => {
          refs.centerSide = el
        }}
      >
        <div
          class="editor-toolbar__label-button editor-toolbar__size"
          ref={(el) => {
            refs.sizeButton = el
          }}
        >
          <span
            ref={(el) => {
              refs.sizeLabel = el
            }}
          />
          <div class="editor-toolbar__button svg-icon-size svg-icon-dark" />
        </div>
        <div
          class="editor-toolbar__label-button editor-toolbar__alpha"
          ref={(el) => {
            refs.alphaButton = el
          }}
        >
          <div
            class="editor-toolbar__button svg-icon-opacity svg-icon-dark"
            ref={(el) => {
              refs.alphaIcon = el
            }}
          />
          <span
            ref={(el) => {
              refs.alphaLabel = el
            }}
          />
        </div>
      </div>

      <div
        class="editor-toolbar__right"
        ref={(el) => {
          refs.rightSide = el
        }}
      >
        <div
          class="editor-toolbar__button editor__save-copy svg-icon-download svg-icon-dark"
          ref={(el) => {
            refs.saveCopyButton = el
          }}
        />
      </div>
    </div>

    <div
      class="editor-toolbar__params-container params-container"
      ref={(el) => {
        refs.params = el
      }}
    >
      <div
        class="horizontal-slider editor-toolbar__slider"
        ref={(el) => {
          refs.slider = el
        }}
      >
        <div
          ref={(el) => {
            refs.sliderCursor = el
          }}
        >
          <span
            ref={(el) => {
              refs.sliderLabel = el
            }}
          />
        </div>
      </div>
    </div>

    <div
      class="editor-toolbar__tool-preview drawith__overlay-spinner displayNone"
      ref={(el) => {
        refs.toolPreview = el
      }}
    >
      <div
        class="editor-toolbar__tool-preview-popup params-container"
        ref={(el) => {
          refs.toolPreviewPopup = el
        }}
      >
        <canvas
          ref={(el) => {
            refs.toolPreviewCanvas = el
          }}
        />
      </div>
    </div>
  </>
)
