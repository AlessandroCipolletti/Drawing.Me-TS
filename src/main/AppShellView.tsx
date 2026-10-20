import { h } from 'ui/jsx-runtime'

export interface AppShellRefs {
  mainContainer: HTMLElement | null
  pagesContainer: HTMLElement | null
  menuPlaceholder: HTMLElement | null
  menuItemFolder: HTMLElement | null
  menuItemDashboard: HTMLElement | null
  menuItemAbout: HTMLElement | null
  menuPagesClear: HTMLElement | null
}

export interface AppShellViewProps {
  labels: {
    folderPageLabel: string
    dashboardPageLabel: string
    aboutUs: string
  }
  refs: AppShellRefs
}

export const AppShellView = ({ labels, refs }: AppShellViewProps) => (
  <div
    class="drawith__main-container"
    ref={(el) => {
      refs.mainContainer = el
    }}
  >
    <div class="drawith__menu-container">
      <div class="drawith__menu-header">
        <div class="drawith__menu-icons" />
      </div>

      <div class="drawith__menu-pages">
        <div
          class="drawith__menu-pages-placeholder"
          ref={(el) => {
            refs.menuPlaceholder = el
          }}
        />
        <div
          class="drawith__menu-item drawith__menu-item-folder"
          ref={(el) => {
            refs.menuItemFolder = el
          }}
        >
          <div class="drawith__menu-item-icon svg-icon-drawing svg-icon-light" />
          <span>{labels.folderPageLabel}</span>
        </div>

        <div
          class="drawith__menu-item drawith__menu-item-dashboard"
          ref={(el) => {
            refs.menuItemDashboard = el
          }}
        >
          <div class="drawith__menu-item-icon svg-icon-move svg-icon-light" />
          <span>{labels.dashboardPageLabel}</span>
        </div>

        <div
          class="drawith__menu-item drawith__menu-item-about"
          ref={(el) => {
            refs.menuItemAbout = el
          }}
        >
          <div class="drawith__menu-item-icon svg-icon-info-line svg-icon-light" />
          <span>{labels.aboutUs}</span>
        </div>

        <div
          class="drawith__menu-pages-clear"
          ref={(el) => {
            refs.menuPagesClear = el
          }}
        />
      </div>
    </div>
    <div
      class="drawith__pages-container"
      ref={(el) => {
        refs.pagesContainer = el
      }}
    />
  </div>
)
