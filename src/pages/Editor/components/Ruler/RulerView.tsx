import { h, Fragment } from 'ui/jsx-runtime'

export interface RulerRefs {
  ruler: HTMLElement | null
  rulerOrigin: HTMLElement | null
  rulerBottom: HTMLElement | null
  rulerLevel: HTMLElement | null
  rulerCenter: HTMLElement | null
  rulerStart: HTMLElement | null
  rulerLevelValue: HTMLElement | null
  rulerGestureOne: HTMLElement | null
  rulerGestureTwo: HTMLElement | null
  perpendicularButton: HTMLElement | null
  specularButton: HTMLElement | null
}

export const RulerView = ({ refs }: { refs: RulerRefs }) => (
  <>
    <div
      class="editor__tool-ruler displayNone"
      ref={(el) => {
        refs.ruler = el
      }}
    >
      <div
        class="editor__tool-ruler-origin"
        ref={(el) => {
          refs.rulerOrigin = el
        }}
      />
      <div
        class="editor__tool-ruler-start"
        ref={(el) => {
          refs.rulerStart = el
        }}
      />
      <div
        class="editor__tool-ruler-center"
        ref={(el) => {
          refs.rulerCenter = el
        }}
      />
      <div
        class="editor__tool-ruler-bottom"
        ref={(el) => {
          refs.rulerBottom = el
        }}
      />
      <div
        class="editor__tool-ruler-level"
        ref={(el) => {
          refs.rulerLevel = el
        }}
      >
        <p
          class="editor__tool-ruler-level-value"
          ref={(el) => {
            refs.rulerLevelValue = el
          }}
        >
          0
        </p>
      </div>
      <div
        class="editor__tool-ruler-perpendicular"
        ref={(el) => {
          refs.perpendicularButton = el
        }}
      />
      <div
        class="editor__tool-ruler-specular"
        ref={(el) => {
          refs.specularButton = el
        }}
      />
    </div>
    <div
      class="editor__tool-ruler-gesture-one"
      ref={(el) => {
        refs.rulerGestureOne = el
      }}
    />
    <div
      class="editor__tool-ruler-gesture-two"
      ref={(el) => {
        refs.rulerGestureTwo = el
      }}
    />
  </>
)
