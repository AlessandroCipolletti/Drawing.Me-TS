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
  sizeLabel: HTMLElement | null
  alphaLabel: HTMLElement | null
  toolPreview: HTMLElement | null
  toolPreviewPopup: HTMLElement | null
  toolPreviewCanvas: HTMLCanvasElement | null
  toolPreviewContext: ExtendedCanvasContext | null
}

export const ToolbarView = ({ refs }: { refs: ToolbarRefs }) => (
  <>
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
      >
        <div
          class="editor-toolbar__button editor__back editor-toolbar__button-big svg-icon-back-save svg-icon-dark"
          ref={(el) => {
            refs.backButton = el
          }}
        />
      </div>

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
          <div class="editor-toolbar__button svg-icon-opacity svg-icon-dark" />
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
        <div
          class="editor-toolbar__button editor__go-fullscreen svg-icon-dynamic-editor-fullscreen svg-icon-dark"
          ref={(el) => {
            refs.goFullscreenButton = el
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
