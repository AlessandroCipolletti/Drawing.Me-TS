import { h } from 'ui/jsx-runtime'

export interface DashboardRefs {
  container: HTMLElement | null
  svg: SVGSVGElement | null
  worldGroup: SVGGElement | null
  spinner: HTMLElement | null
  zoomLabel: SVGTextElement | null
  zoomLabelRect: SVGRectElement | null
  drawButton: HTMLElement | null
  cleanPointerEvents: (() => void) | null
}

export interface DashboardViewProps {
  marginTop: number
  labelToDraw: string
  zoomRectCoord: number
  zoomRectBorderRadius: number
  zoomRectWidth: number
  zoomRectHeight: number
  zoomLabelX: number
  zoomLabelY: number
  spinnerImg: string
  refs: DashboardRefs
}

export const DashboardView = ({
  marginTop,
  labelToDraw,
  zoomRectCoord,
  zoomRectBorderRadius,
  zoomRectWidth,
  zoomRectHeight,
  zoomLabelX,
  zoomLabelY,
  spinnerImg,
  refs,
}: DashboardViewProps) => (
  <div
    class="dashboard__container displayNone"
    style={`height: calc(100% - ${marginTop}px); top: ${marginTop}px;`}
    ref={(el) => {
      refs.container = el
    }}
  >
    <svg
      version="1.1"
      class="dashboard__svg"
      ref={(el) => {
        refs.svg = el as unknown as SVGSVGElement
      }}
    >
      <g
        class="dashboard__world-group"
        ref={(el) => {
          refs.worldGroup = el as unknown as SVGGElement
        }}
      />
      <rect
        class="dashboard__zoom-label-rect"
        x={zoomRectCoord}
        y={zoomRectCoord}
        rx={zoomRectBorderRadius}
        ry={zoomRectBorderRadius}
        width={zoomRectWidth}
        height={zoomRectHeight}
        ref={(el) => {
          refs.zoomLabelRect = el as unknown as SVGRectElement
        }}
      />
      <text
        class="dashboard__zoom-label"
        x={zoomLabelX}
        y={zoomLabelY}
        ref={(el) => {
          refs.zoomLabel = el as unknown as SVGTextElement
        }}
      >
        100%
      </text>
    </svg>
    <a
      class="dashboard__showeditor button"
      ref={(el) => {
        refs.drawButton = el
      }}
    >
      {labelToDraw}
    </a>
    <div
      class="dashboard__spinner"
      ref={(el) => {
        refs.spinner = el
      }}
    >
      <img class="dashboard__spinner-image" src={spinnerImg} />
    </div>
  </div>
)
