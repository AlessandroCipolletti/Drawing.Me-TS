import { h } from 'ui/jsx-runtime'
import {
  CUSTOM_BRUSH_FRAME_OPTIONS,
  CUSTOM_BRUSH_PARAM_SCHEMA,
  formatSchemaNumber,
  PARAM_SECTIONS,
} from './customBrushParamSchema'
import type { CustomBrushDraftProps } from './customBrushTypes'
import type { CustomFrameEditorRefs } from './customFrameEditor'

interface ParamControlRef {
  row: HTMLElement | null
  slider: HTMLElement | null
  cursor: HTMLElement | null
  valueLabel: HTMLElement | null
  toggleEl: HTMLElement | null
  resetBtn: HTMLElement | null
  optionButtons: Record<string, HTMLElement>
}

const ParamResetButton = ({ ctrlRef }: { ctrlRef: ParamControlRef }) => (
  <div
    class="cb-param-reset"
    title="Reset"
    ref={(el) => {
      ctrlRef.resetBtn = el
    }}
  >
    ↺
  </div>
)

export interface CustomBrushModalRefs {
  root: HTMLElement | null
  paramsPane: HTMLElement | null
  previewPane: HTMLElement | null
  previewCanvas: HTMLCanvasElement | null
  resetPreviewBtn: HTMLElement | null
  frameButtons: Record<string, HTMLElement>
  fileInput: HTMLInputElement | null
  imageThumbWrap: HTMLElement | null
  imageThumbImg: HTMLImageElement | null
  reuploadImageBtn: HTMLElement | null
  redrawFrameBtn: HTMLElement | null
  sectionContainers: Record<string, HTMLElement>
  sectionBodies: Record<string, HTMLElement>
  sectionToggleHeaders: Record<string, HTMLElement>
  controls: Record<string, ParamControlRef>
  deleteBtn: HTMLElement | null
  cancelBtn: HTMLElement | null
  saveBtn: HTMLElement | null
  frameEditor: CustomFrameEditorRefs
}

const renderFrameGlyph = (id: string) => {
  switch (id) {
    case 'circle':
      return <span class="cb-frame-glyph cb-frame-glyph--circle" />
    case 'square':
      return <span class="cb-frame-glyph cb-frame-glyph--square" />
    case 'triangle':
      return <span class="cb-frame-glyph cb-frame-glyph--triangle" />
    case 'sprayCircle':
      return <span class="cb-frame-glyph cb-frame-glyph--spray" />
    case 'particlesCircle':
      return <span class="cb-frame-glyph cb-frame-glyph--dots-circle" />
    case 'particlesRect':
      return <span class="cb-frame-glyph cb-frame-glyph--dots-rect" />
    case 'image':
      return <span class="cb-frame-glyph cb-frame-glyph--image" />
    case 'customDraw':
      return <span class="cb-frame-glyph cb-frame-glyph--draw" />
    default:
      return <span class="cb-frame-glyph cb-frame-glyph--circle" />
  }
}

export const CustomBrushModalView = ({
  mode,
  draft,
  refs,
}: {
  mode: 'create' | 'edit'
  brushNumber?: number
  draft: CustomBrushDraftProps
  refs: CustomBrushModalRefs
}) => {
  return (
    <div
      class="custom-brush-modal"
      ref={(el) => {
        refs.root = el
      }}
    >
      <div class="custom-brush-modal__body">
        <div
          class="custom-brush-modal__params-pane scrollable"
          ref={(el) => {
            refs.paramsPane = el
          }}
        >
          <div class="custom-brush-modal__top-bar">
            <div class="custom-brush-modal__badge">frame</div>
            <div class="custom-brush-modal__frames-row">
              {CUSTOM_BRUSH_FRAME_OPTIONS.map((opt) => (
                <div
                  class="cb-frame-tile"
                  data-frame-option={opt.id}
                  title={opt.label}
                  ref={(el) => {
                    refs.frameButtons[opt.id] = el
                  }}
                >
                  {renderFrameGlyph(opt.id)}
                  <span class="cb-frame-tile__label">{opt.label}</span>
                </div>
              ))}
            </div>
          </div>

          <input
            type="file"
            class="displayNone"
            ref={(el) => {
              refs.fileInput = el
              el.setAttribute('accept', 'image/*')
            }}
          />

          <div
            class="custom-brush-modal__image-bar displayNone"
            ref={(el) => {
              refs.imageThumbWrap = el
            }}
          >
            <div class="custom-brush-modal__image-thumb-box">
              <img
                class="custom-brush-modal__image-thumb"
                alt=""
                ref={(el) => {
                  refs.imageThumbImg = el
                }}
              />
            </div>
            <div
              class="cb-pill-btn"
              ref={(el) => {
                refs.reuploadImageBtn = el
              }}
            >
              Upload
            </div>
            <div
              class="cb-pill-btn"
              ref={(el) => {
                refs.redrawFrameBtn = el
              }}
            >
              Draw
            </div>
          </div>

          <div class="custom-brush-modal__sections">
            {PARAM_SECTIONS.map((section) => {
              const entries = CUSTOM_BRUSH_PARAM_SCHEMA.filter((e) => e.section === section.id)
              return (
                <div
                  class={`cb-section${section.collapsible ? ' cb-section--collapsible' : ''}`}
                  data-section={section.id}
                  ref={(el) => {
                    refs.sectionContainers[section.id] = el
                  }}
                >
                  <div
                    class="cb-section__header"
                    ref={(el) => {
                      if (section.collapsible) {
                        refs.sectionToggleHeaders[section.id] = el
                      }
                    }}
                  >
                    <span class="cb-section__title">{section.label}</span>
                    {section.collapsible ? <span class="cb-section__chevron">▾</span> : null}
                  </div>
                  <div
                    class={`cb-section__grid${section.collapsible ? ' displayNone' : ''}`}
                    ref={(el) => {
                      refs.sectionBodies[section.id] = el
                    }}
                  >
                    {entries.map((entry) => {
                      const key = String(entry.key)
                      const ctrlRef: ParamControlRef = {
                        row: null,
                        slider: null,
                        cursor: null,
                        valueLabel: null,
                        toggleEl: null,
                        resetBtn: null,
                        optionButtons: {},
                      }
                      refs.controls[key] = ctrlRef
                      const currentVal = draft[entry.key]

                      if (entry.kind === 'slider') {
                        return (
                          <div
                            class="cb-param-row cb-param-row--slider"
                            data-param-key={key}
                            ref={(el) => {
                              ctrlRef.row = el
                            }}
                          >
                            <div class="cb-param-row__head">
                              <span class="cb-param-row__label">{entry.label}</span>
                              <span class="cb-param-row__meta">
                                <span
                                  class="cb-param-row__value"
                                  ref={(el) => {
                                    ctrlRef.valueLabel = el
                                  }}
                                >
                                  {formatSchemaNumber(entry, currentVal)}
                                </span>
                                <ParamResetButton ctrlRef={ctrlRef} />
                              </span>
                            </div>
                            <div
                              class="horizontal-slider cb-slider"
                              ref={(el) => {
                                ctrlRef.slider = el
                              }}
                            >
                              <div
                                class="cb-slider__cursor"
                                ref={(el) => {
                                  ctrlRef.cursor = el
                                }}
                              />
                            </div>
                          </div>
                        )
                      }

                      if (entry.kind === 'toggle') {
                        const active = Boolean(currentVal)
                        return (
                          <div
                            class="cb-param-row cb-param-row--toggle"
                            data-param-key={key}
                            ref={(el) => {
                              ctrlRef.row = el
                            }}
                          >
                            <span class="cb-param-row__label">{entry.label}</span>
                            <span class="cb-param-row__meta">
                              <div
                                class={`cb-switch${active ? ' cb-switch--on' : ''}`}
                                ref={(el) => {
                                  ctrlRef.toggleEl = el
                                }}
                              >
                                <div class="cb-switch__thumb" />
                              </div>
                              <ParamResetButton ctrlRef={ctrlRef} />
                            </span>
                          </div>
                        )
                      }

                      if (entry.kind === 'segmented' || entry.kind === 'select') {
                        const strVal = currentVal === undefined ? '' : String(currentVal)
                        return (
                          <div
                            class={`cb-param-row cb-param-row--options${
                              entry.kind === 'select' ? ' cb-param-row--full' : ''
                            }`}
                            data-param-key={key}
                            ref={(el) => {
                              ctrlRef.row = el
                            }}
                          >
                            <span class="cb-param-row__label">{entry.label}</span>
                            <span class="cb-param-row__meta">
                              <div class="cb-segmented">
                                {(entry.options || []).map((opt) => (
                                  <div
                                    class={`cb-segmented__btn${
                                      strVal === opt.value ? ' cb-segmented__btn--active' : ''
                                    }`}
                                    data-option-value={opt.value}
                                    ref={(el) => {
                                      ctrlRef.optionButtons[opt.value] = el
                                    }}
                                  >
                                    {opt.label}
                                  </div>
                                ))}
                              </div>
                              <ParamResetButton ctrlRef={ctrlRef} />
                            </span>
                          </div>
                        )
                      }

                      return null
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div
          class="custom-brush-modal__preview-pane"
          ref={(el) => {
            refs.previewPane = el
          }}
        >
          <div class="custom-brush-modal__preview-card">
            <canvas
              class="custom-brush-modal__preview-canvas"
              ref={(el) => {
                refs.previewCanvas = el
              }}
            />
            <div
              class="custom-brush-modal__preview-reset"
              title="Reset sample stroke"
              ref={(el) => {
                refs.resetPreviewBtn = el
              }}
            >
              ↺
            </div>
          </div>
        </div>
      </div>

      <div class="custom-brush-modal__footer">
        <div class="custom-brush-modal__footer-left">
          <div
            class={`cb-footer-btn cb-footer-btn--delete${mode === 'edit' ? '' : ' displayNone'}`}
            ref={(el) => {
              refs.deleteBtn = el
            }}
          >
            Delete
          </div>
        </div>
        <div class="custom-brush-modal__footer-right">
          <div
            class="cb-footer-btn cb-footer-btn--cancel"
            ref={(el) => {
              refs.cancelBtn = el
            }}
          >
            Cancel
          </div>
          <div
            class="cb-footer-btn cb-footer-btn--save"
            ref={(el) => {
              refs.saveBtn = el
            }}
          >
            Save
          </div>
        </div>
      </div>

      <div
        class="custom-frame-editor displayNone"
        ref={(el) => {
          refs.frameEditor.overlay = el
        }}
      >
        <div class="custom-frame-editor__dialog">
          <div class="custom-frame-editor__canvas-slot">
            <div class="custom-frame-editor__canvas-wrap">
              <canvas
                class="custom-frame-editor__canvas"
                ref={(el) => {
                  refs.frameEditor.canvas = el
                }}
              />
            </div>
          </div>

          <div class="custom-frame-editor__controls">
            <div class="custom-frame-editor__slider-row">
              <div class="cb-param-row__head">
                <span class="cb-param-row__label">Size</span>
                <span
                  class="cb-param-row__value"
                  ref={(el) => {
                    refs.frameEditor.sizeValueLabel = el
                  }}
                >
                  48px
                </span>
              </div>
              <div
                class="horizontal-slider cb-slider"
                ref={(el) => {
                  refs.frameEditor.sizeSlider = el
                }}
              >
                <div
                  class="cb-slider__cursor"
                  ref={(el) => {
                    refs.frameEditor.sizeCursor = el
                  }}
                />
              </div>
            </div>

            <div class="custom-frame-editor__slider-row">
              <div class="cb-param-row__head">
                <span class="cb-param-row__label">Opacity</span>
                <span
                  class="cb-param-row__value"
                  ref={(el) => {
                    refs.frameEditor.opacityValueLabel = el
                  }}
                >
                  100%
                </span>
              </div>
              <div
                class="horizontal-slider cb-slider"
                ref={(el) => {
                  refs.frameEditor.opacitySlider = el
                }}
              >
                <div
                  class="cb-slider__cursor"
                  ref={(el) => {
                    refs.frameEditor.opacityCursor = el
                  }}
                />
              </div>
            </div>

            <div
              class="cb-pill-btn custom-frame-editor__clear"
              ref={(el) => {
                refs.frameEditor.clearBtn = el
              }}
            >
              Clear
            </div>
          </div>

          <div class="custom-frame-editor__footer">
            <div
              class="cb-footer-btn cb-footer-btn--cancel"
              ref={(el) => {
                refs.frameEditor.cancelBtn = el
              }}
            >
              Cancel
            </div>
            <div
              class="cb-footer-btn cb-footer-btn--save"
              ref={(el) => {
                refs.frameEditor.saveBtn = el
              }}
            >
              Done
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
