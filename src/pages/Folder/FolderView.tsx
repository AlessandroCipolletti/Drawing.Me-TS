import { h, Fragment } from 'ui/jsx-runtime'

export interface FolderRefs {
  container: HTMLElement | null
  drawingsContainer: HTMLElement | null
  selectButton: HTMLElement | null
  doneButton: HTMLElement | null
  exportButton: HTMLElement | null
  deleteButton: HTMLElement | null
  sendButton: HTMLElement | null
  topnav: HTMLElement | null
  coworkingPopup: HTMLElement | null
  coworkingId: HTMLElement | null
  copyCoworkingUrlButton: HTMLElement | null
  copiedCoworkingLabel: HTMLElement | null
  coworkingCopyIcon: HTMLElement | null
  newDrawingButton: HTMLElement | null
  newCoworkingButton: HTMLElement | null
  newContainer: HTMLElement | null
}

export interface FolderLabels {
  select: string
  done: string
  offline: string
  areYouSure: string
  tapAndHoldOneImage: string
  tapAndHoldImages: string
  withWhiteBackground: string
  withoutBackground: string
  newDrawing: string
  drawWithAFriend: string
  navbarTitle: string
  tapToShare: string
  copied: string
  coworkingPopupTitle: string
  coworkingPopupIstructions1: string
  coworkingPopupIstructions2: string
  waitingToReconnect: string
}

export const FolderView = ({ labels, refs }: { labels: FolderLabels; refs: FolderRefs }) => (
  <div
    class="folder__container displayNone"
    ref={(el) => {
      refs.container = el
    }}
  >
    <div
      class="folder__new-container"
      ref={(el) => {
        refs.newContainer = el
      }}
    >
      <div
        class="folder__drawing folder__drawing-new-drawing"
        ref={(el) => {
          refs.newDrawingButton = el
        }}
      >
        <span>{labels.newDrawing}</span>
      </div>
      <div
        class="folder__drawing folder__drawing-new-coworking"
        ref={(el) => {
          refs.newCoworkingButton = el
        }}
      >
        <span>{labels.drawWithAFriend}</span>
        <div class="folder__drawing-new-coworking-offline">{labels.offline}</div>
      </div>
    </div>

    <div
      class="folder__topbar"
      ref={(el) => {
        refs.topnav = el
      }}
    >
      <span class="folder__topbar-title">{labels.navbarTitle}</span>
      <div
        class="folder__topbar-button folder__topbar-button-TEXT folder__topbar-button-select"
        ref={(el) => {
          refs.selectButton = el
        }}
      >
        {labels.select}
      </div>
      <div
        class="folder__topbar-button folder__topbar-button-TEXT folder__topbar-button-done displayNone"
        ref={(el) => {
          refs.doneButton = el
        }}
      >
        {labels.done}
      </div>
      <div
        class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-delete svg-icon-delete svg-icon-dark disabled"
        ref={(el) => {
          refs.deleteButton = el
        }}
      />
      <div
        class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-export svg-icon-export svg-icon-dark disabled"
        ref={(el) => {
          refs.exportButton = el
        }}
      />
    </div>

    <div
      class="folder__coworking-popup"
      ref={(el) => {
        refs.coworkingPopup = el
      }}
    >
      <div class="folder__coworking-popup-title">{labels.coworkingPopupTitle}</div>
      <div class="folder__coworking-popup-id-container">
        <div
          class="folder__coworking-popup-id"
          ref={(el) => {
            refs.coworkingId = el
          }}
        />
        <div
          class="svg-icon-copy svg-icon-gray folder__coworking-copy-icon"
          ref={(el) => {
            refs.coworkingCopyIcon = el
          }}
        />
      </div>
      <span
        class="folder__coworking-popup-copy"
        ref={(el) => {
          refs.copyCoworkingUrlButton = el
        }}
      >
        {labels.tapToShare}
      </span>
      <span
        class="folder__coworking-popup-copied"
        ref={(el) => {
          refs.copiedCoworkingLabel = el
        }}
      >
        {labels.copied}
      </span>
      <br />
      <br />
      <span class="folder__coworking-popup-instructions">{labels.coworkingPopupIstructions2}</span>
    </div>

    <div
      class="folder__drawings-container"
      ref={(el) => {
        refs.drawingsContainer = el
      }}
    />
  </div>
)

export const FolderDrawingsListView = ({
  drawings,
}: {
  drawings: Array<{ localDbId: number | string; base64?: string }>
}) => (
  <>
    {drawings.map((item) => (
      <div class="folder__drawing" data-local-id={String(item.localDbId)}>
        <img class="folder__drawing-preview" src={item.base64 || ''} />
        <div class="folder__drawing-select-icon" />
      </div>
    ))}
  </>
)

export const FolderSharePopupView = ({
  drawings,
  subtitleLabel,
  withoutBackgroundLabel,
  withBackgroundLabel,
}: {
  drawings: Array<{ t: string; w: string }>
  subtitleLabel: string
  withoutBackgroundLabel: string
  withBackgroundLabel: string
}) => (
  <div class="folder__share-popup">
    <div class="folder__share-popup-title">{subtitleLabel}</div>
    <div class="folder__share-popup-subtitle">
      <div>{withoutBackgroundLabel}</div>
      <div>{withBackgroundLabel}</div>
    </div>
    <div class="folder__share-popup-content">
      {drawings.map((item) => (
        <div class="folder__share-popup-line">
          <img class="folder__share-popup-image" src={item.t} />
          <img class="folder__share-popup-image" src={item.w} />
        </div>
      ))}
    </div>
  </div>
)
