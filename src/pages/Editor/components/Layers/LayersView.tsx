import { h, Fragment } from 'ui/jsx-runtime'

export interface LayersRefs {
  layersContainer: HTMLElement | null
  layersList: HTMLElement | null
  layerListElement: HTMLElement | null
  addNewLayerButton: HTMLElement | null
  paramsContainer: HTMLElement | null
  visibilityLayerButton: HTMLElement | null
  editLayerNameButton: HTMLElement | null
  duplicateLayerButton: HTMLElement | null
  mergeDownLayerButton: HTMLElement | null
  flipVerticalButton: HTMLElement | null
  flipHorizontalButton: HTMLElement | null
  sendLayerButton: HTMLElement | null
  deleteLayerButton: HTMLElement | null
  opacitySlider: HTMLElement | null
  opacityCursor: HTMLElement | null
  opacityLabel: HTMLElement | null
  canvasPanButton?: HTMLElement | null
  layersToggleButton?: HTMLElement | null
  resizeButton: HTMLElement | null
  gcoButton: HTMLElement | null
  imageForResize: HTMLCanvasElement | OffscreenCanvas | null
}

export const LayersView = ({ maxLength, refs }: { maxLength: number; refs: LayersRefs }) => (
  <>
    <div
      class="editor-layers__container"
      ref={(el) => {
        refs.layersContainer = el
      }}
    >
      <div class="editor-layers__header">
        <span class="editor-layers__header-title">Layers</span>
        <div
          class="editor-layers__add-new"
          ref={(el) => {
            refs.addNewLayerButton = el
          }}
        >
          <div class="svg-icon-plus" />
        </div>
      </div>

      <div
        class="editor-layers__list"
        ref={(el) => {
          refs.layersList = el
        }}
      />

      <div
        class="editor-layers__layer"
        draggable="false"
        ref={(el) => {
          refs.layerListElement = el
        }}
      >
        <div class="editor-layers__layer-thumb">
          <div class="editor-layers__layer-coworker-icon">
            <div class="svg-icon-user svg-icon-gray" />
          </div>
          <div class="editor-layers__layer-selected-icon">
            <div class="svg-icon-edit svg-icon-gray" />
          </div>
          <canvas class="editor-layers__layer-preview" draggable="false" />
        </div>
        <div class="editor-layers__layer-options">
          <div class="editor-layers__layer-options-name">
            <input type="text" maxlength={maxLength} />
          </div>
          <div class="editor-layers__layer-options-button svg-icon-gray" />
        </div>
      </div>
    </div>

    <div
      class="editor-layers__params-container params-container"
      ref={(el) => {
        refs.paramsContainer = el
      }}
    >
      <div
        class="editor-layers__params-visibility"
        ref={(el) => {
          refs.visibilityLayerButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-name"
        ref={(el) => {
          refs.editLayerNameButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-rename svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-flip-horizontal"
        ref={(el) => {
          refs.flipHorizontalButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-flip-horizontal svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-flip-vertical"
        ref={(el) => {
          refs.flipVerticalButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-flip-vertical svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-duplicate"
        ref={(el) => {
          refs.duplicateLayerButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-duplicate svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-merge-down"
        ref={(el) => {
          refs.mergeDownLayerButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-merge-down svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-send"
        ref={(el) => {
          refs.sendLayerButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-send svg-icon-dark" />
      </div>
      <div
        class="editor-layers__params-delete"
        ref={(el) => {
          refs.deleteLayerButton = el
        }}
      >
        <div class="editor-layers__params-icon svg-icon-delete svg-icon-dark" />
      </div>
      <div
        class="vertical-slider editor-layers__opacity-slider"
        ref={(el) => {
          refs.opacitySlider = el
        }}
      >
        <div
          ref={(el) => {
            refs.opacityCursor = el
          }}
        >
          <span
            ref={(el) => {
              refs.opacityLabel = el
            }}
          />
        </div>
      </div>
    </div>
    <div
      ref={(el) => {
        refs.resizeButton = el
      }}
    >
      <div class="editor-layers__resize-button svg-icon-move svg-icon-dark" />
    </div>
  </>
)
