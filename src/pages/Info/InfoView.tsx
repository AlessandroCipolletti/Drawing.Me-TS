import { h } from 'ui/jsx-runtime'

export interface InfoViewProps {
  labels: {
    createdBy: string
    version: string
    and: string
    aboutUs: string
  }
  version: string
  onAboutTabRef?: (el: HTMLElement) => void
}

export const InfoView = ({ labels, version, onAboutTabRef }: InfoViewProps) => (
  <div class="drawith__info">
    <div class="tabs-wrapper drawith__info-tabs-wrapper">
      <div class="tabs-header">
        <div class="tab-header-item" data-tab-id="about-us" ref={onAboutTabRef}>
          <span>{labels.aboutUs}</span>
        </div>
      </div>
      <div class="tabs-content">
        <div class="tab-content scrollable drawith__aboutus" data-tab-id="about-us">
          <div class="drawith__aboutus-logo" />
          <div class="drawith__aboutus-draw" />
          <span class="drawith__aboutus-version">
            {labels.version}: {version}
          </span>
          <p class="drawith__aboutus-info">
            {labels.createdBy}
            <br />
            <a href="mailto:cipolletti.alessandro@gmail.com">Cipolletti Alessandro</a>
            <br />
            {labels.and}
            <br />
            Gaetano Saturno
          </p>
        </div>
      </div>
    </div>
  </div>
)
