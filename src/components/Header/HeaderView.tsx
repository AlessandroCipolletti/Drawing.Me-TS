import { h } from 'ui/jsx-runtime'

export interface HeaderRefs {
  container: HTMLElement | null
  menuButton: HTMLElement | null
  refreshIcon: HTMLElement | null
}

export const HeaderView = ({ refs }: { refs: HeaderRefs }) => (
  <div
    class="header__container"
    ref={(el) => {
      refs.container = el
    }}
  >
    <div
      class="menu-button displayNone"
      ref={(el) => {
        refs.menuButton = el
      }}
    >
      <svg width="100px" height="100px" viewBox="0 0 1000 1000">
        <path
          id="pathA"
          d="M 300 400 L 700 400 C 900 400 900 750 600 850 A 400 400 0 0 1 200 200 L 800 800"
        />
        <path id="pathB" d="M 300 500 L 700 500" />
        <path
          id="pathC"
          d="M 700 600 L 300 600 C 100 600 100 200 400 150 A 400 380 0 1 1 200 800 L 800 200"
        />
      </svg>
    </div>

    <div
      class="header__refresh-icon svg-icon-refresh svg-icon-gray svg-icon-with-rotation"
      ref={(el) => {
        refs.refreshIcon = el
      }}
    />

    <div class="header__logo" />
  </div>
)
