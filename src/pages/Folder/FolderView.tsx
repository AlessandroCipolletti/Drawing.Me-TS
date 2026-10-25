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
  countBadge?: HTMLElement | null
  selectionBadge?: HTMLElement | null
}

export interface FolderLabels {
  select: string
  done: string
  offline: string
  areYouSure: string
  renameDrawingPrompt: string
  rename: string
  duplicate: string
  delete: string
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

export interface FolderDrawingItem {
  localDbId: number | string
  title?: string
  base64?: string
  preview?: string
  updateTimestamp?: number
  createTimestamp?: number
  paper?: string
  madeByCorowking?: boolean
  layers?: unknown[]
  wasSavedAsDraft?: boolean
}

const formatDrawingTimestamp = (ts?: number): string => {
  if (!ts || !Number.isFinite(ts)) return 'Saved'
  try {
    const date = new Date(ts)
    const now = new Date()
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (isToday) {
      return `Today, ${timeStr}`
    }
    const monthDay = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    return `${monthDay} · ${timeStr}`
  } catch {
    return 'Saved'
  }
}

export const FolderView = ({ labels, refs }: { labels: FolderLabels; refs: FolderRefs }) => (
  <div
    class="folder__container displayNone"
    ref={(el) => {
      refs.container = el
    }}
  >
    {/* CENTERED FLOATING TOP STUDIO DOCK */}
    <div class="folder__studio-dock">
      <div
        class="folder__new-container"
        ref={(el) => {
          refs.newContainer = el
        }}
      >
        <div
          class="folder__dock-action folder__dock-action-primary folder__launch-card folder__drawing-new-drawing"
          ref={(el) => {
            refs.newDrawingButton = el
          }}
        >
          <div class="folder__dock-action-icon svg-icon-plus svg-icon-light" />
          <span class="folder__dock-action-label">{labels.newDrawing}</span>
        </div>

        <div
          class="folder__dock-action folder__launch-card folder__launch-card-coop folder__drawing-new-coworking"
          ref={(el) => {
            refs.newCoworkingButton = el
          }}
        >
          <div class="folder__dock-action-icon svg-icon-users svg-icon-dark" />
          <span class="folder__dock-action-label">{labels.drawWithAFriend}</span>
          <span class="folder__live-dot" />
          <div class="folder__drawing-new-coworking-offline">{labels.offline}</div>
        </div>
      </div>

      <div
        class="folder__topbar"
        ref={(el) => {
          refs.topnav = el
        }}
      >
        <span
          class="folder__count-badge"
          ref={(el) => {
            refs.countBadge = el
          }}
        >
          0 sketches
        </span>
        <span
          class="folder__selection-badge"
          ref={(el) => {
            refs.selectionBadge = el
          }}
        >
          0 selected
        </span>

        <div class="folder__topbar-actions">
          <div
            class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-export disabled"
            ref={(el) => {
              refs.exportButton = el
            }}
          >
            <div class="folder__topbar-btn-icon svg-icon-export svg-icon-dark" />
            <span>Export</span>
          </div>
          <div
            class="folder__topbar-button folder__topbar-button-ICON folder__topbar-button-delete disabled"
            ref={(el) => {
              refs.deleteButton = el
            }}
          >
            <div class="folder__topbar-btn-icon svg-icon-delete svg-icon-dark" />
            <span>Delete</span>
          </div>
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
        </div>
      </div>
    </div>

    {/* FULL-STAGE DRAWINGS GALLERY */}
    <div
      class="folder__drawings-container"
      ref={(el) => {
        refs.drawingsContainer = el
      }}
    />

    {/* COWORKING INVITE MODAL */}
    <div
      class="folder__coworking-popup"
      ref={(el) => {
        refs.coworkingPopup = el
      }}
    >
      <div class="folder__coworking-popup-badge">SHARED CANVAS</div>
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
  </div>
)

export const FolderDrawingsListView = ({ drawings }: { drawings: FolderDrawingItem[] }) => {
  if (!drawings || drawings.length === 0) {
    return (
      <div class="folder__empty-state">
        <div class="folder__empty-box">
          <div class="folder__empty-icon svg-icon-drawing svg-icon-gray" />
          <div class="folder__empty-title">Your sketchbook is empty</div>
          <div class="folder__empty-subtitle">
            Use the toolbar above to start a solo sketch or draw live with a friend.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {drawings.map((item) => {
        const layerCount = Array.isArray(item.layers) ? item.layers.length : 0
        const paperClass = item.paper ? `paper-${item.paper}` : 'paper-white'
        const imgSrc = item.base64 || item.preview || ''
        const displayTitle =
          typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : `Sketch #${String(item.localDbId)}`
        return (
          <div class="folder__drawing" data-local-id={String(item.localDbId)}>
            <div class={`folder__drawing-stage ${paperClass}`}>
              <img class="folder__drawing-preview" src={imgSrc} alt="" />
              <div class="folder__drawing-select-icon" />
              <div class="folder__drawing-badges">
                {item.madeByCorowking ? <div class="folder__drawing-coop-pill">Co-op</div> : null}
                {layerCount > 0 ? (
                  <div class="folder__drawing-layers-pill">
                    <div class="folder__drawing-layers-icon svg-icon-layers-mini svg-icon-dark" />
                    <span>{layerCount}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div class="folder__drawing-meta">
              <div class="folder__drawing-meta-left">
                <span class="folder__drawing-name">{displayTitle}</span>
                <span class="folder__drawing-date">
                  {formatDrawingTimestamp(item.updateTimestamp || item.createTimestamp)}
                </span>
              </div>
              <div class="folder__drawing-meta-right">
                <div class="folder__drawing-menu-anchor">
                  <div
                    class="folder__drawing-menu-btn"
                    data-action="toggle-menu"
                    role="button"
                    aria-label="Drawing settings"
                  >
                    <div class="folder__drawing-menu-btn-icon svg-icon-options svg-icon-dark" />
                  </div>
                  <div class="folder__drawing-menu">
                    <div class="folder__drawing-menu-item" data-menu-action="rename">
                      <div class="folder__drawing-menu-item-icon svg-icon-edit svg-icon-dark" />
                      <span>Rename</span>
                    </div>
                    <div class="folder__drawing-menu-item" data-menu-action="duplicate">
                      <div class="folder__drawing-menu-item-icon svg-icon-duplicate svg-icon-dark" />
                      <span>Duplicate</span>
                    </div>
                    <div class="folder__drawing-menu-divider" />
                    <div
                      class="folder__drawing-menu-item folder__drawing-menu-item-danger"
                      data-menu-action="delete"
                    >
                      <div class="folder__drawing-menu-item-icon svg-icon-delete" />
                      <span>Delete</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

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
          <img class="folder__share-popup-image" src={item.t} alt="" />
          <img class="folder__share-popup-image" src={item.w} alt="" />
        </div>
      ))}
    </div>
  </div>
)
