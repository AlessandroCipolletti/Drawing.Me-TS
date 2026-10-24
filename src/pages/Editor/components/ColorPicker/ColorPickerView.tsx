import { h, Fragment } from 'ui/jsx-runtime'
import { PaletteColor } from './paletteColor'

export interface ColorPickerRefs {
  colorPickerContainer: HTMLElement | null
  randomButtom: HTMLElement | null
  pipetteButtom: HTMLElement | null
  colorsContainer: HTMLElement | null
  input: HTMLInputElement | null
  paramsContainer: HTMLElement | null
  brightnessSlider: HTMLElement | null
  brightnessCursor: HTMLElement | null
  brightnessLabel: HTMLElement | null
  suggestedContainer: HTMLElement | null
  deleteButton: HTMLElement | null
}

export interface ColorPickerViewProps {
  colors: PaletteColor[]
  labels: {
    brightness: string
    suggested: string
  }
  refs: ColorPickerRefs
}

export const ColorPickerView = ({ colors, labels, refs }: ColorPickerViewProps) => (
  <>
    <div
      class="editor-colorpicker__container"
      ref={(el) => {
        refs.colorPickerContainer = el
      }}
    >
      <div class="editor-colorpicker__input-container">
        <div class="editor-colorpicker__input" />
        <input
          type="color"
          ref={(el) => {
            refs.input = el
          }}
        />
      </div>
      <div class="editor-colorpicker__pipette-container">
        <div
          class="editor-colorpicker__pipette"
          ref={(el) => {
            refs.pipetteButtom = el
          }}
        />
      </div>
      <div class="editor-colorpicker__random-container">
        <div
          class="editor-colorpicker__random"
          ref={(el) => {
            refs.randomButtom = el
          }}
        />
      </div>
      <div
        class="editor-colorpicker__colors-container"
        ref={(el) => {
          refs.colorsContainer = el
        }}
      >
        {colors.map((c) => (
          <div
            class="editor-colorpicker__color"
            data-id={String(c.id)}
            style={`background-color: ${c.finalHex}`}
          />
        ))}
      </div>
    </div>

    <div
      class="editor-colorpicker__params-container params-container"
      ref={(el) => {
        refs.paramsContainer = el
      }}
    >
      <div>
        <span>{labels.brightness}</span>
        <div
          class="horizontal-slider editor-colorpicker__brightness-slider"
          ref={(el) => {
            refs.brightnessSlider = el
          }}
        >
          <div
            ref={(el) => {
              refs.brightnessCursor = el
            }}
          >
            <span
              ref={(el) => {
                refs.brightnessLabel = el
              }}
            />
          </div>
        </div>
      </div>
      <div>
        <span>{labels.suggested}</span>
        <div
          class="editor-colorpicker__suggested-container"
          ref={(el) => {
            refs.suggestedContainer = el
          }}
        />
      </div>
      <div
        class="editor-colorpicker__params-button editor-colorpicker__delete-button svg-icon-delete svg-icon-dark"
        ref={(el) => {
          refs.deleteButton = el
        }}
      />
    </div>
  </>
)
