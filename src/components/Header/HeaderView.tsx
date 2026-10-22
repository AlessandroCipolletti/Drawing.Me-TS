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
      role="button"
      aria-label="Toggle menu"
      ref={(el) => {
        refs.menuButton = el
      }}
    >
      <svg
        class="menu-button__svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <g class="menu-button__icon-menu">
          <path d="M4 7h16" />
          <path d="M4 12h11" />
          <path d="M4 17h16" />
        </g>
        <g class="menu-button__icon-close">
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </g>
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
