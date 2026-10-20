import { h, Fragment } from 'ui/jsx-runtime'

export interface MessagesRefs {
  messageDom: HTMLElement | null
  messageText: HTMLElement | null
  overlay: HTMLElement | null
  confirmButton: HTMLElement | null
  cancelButton: HTMLElement | null
  panel: HTMLElement | null
  updateDom: HTMLElement | null
  currentPanelcontent: HTMLElement | null
  icon: HTMLElement | null
  inputText: HTMLInputElement | null
}

export interface MessagesViewProps {
  labels: {
    ok: string
    cancel: string
  }
  refs: MessagesRefs
}

export const MessagesView = ({ labels, refs }: MessagesViewProps) => (
  <>
    <div
      class="messages__overlay displayNone"
      ref={(el) => {
        refs.overlay = el
      }}
    />
    <div
      class="messages__container"
      ref={(el) => {
        refs.messageDom = el
      }}
    >
      <div
        class="messages__text"
        ref={(el) => {
          refs.messageText = el
        }}
      />
      <input
        type="text"
        class="messages__container-text-input"
        ref={(el) => {
          refs.inputText = el
        }}
      />
      <div
        class="messages__button-cancel"
        ref={(el) => {
          refs.cancelButton = el
        }}
      >
        <p>{labels.cancel}</p>
      </div>
      <div
        class="messages__button-ok"
        ref={(el) => {
          refs.confirmButton = el
        }}
      >
        <p>{labels.ok}</p>
      </div>
      <div
        class="messages__icon"
        ref={(el) => {
          refs.icon = el
        }}
      />
      <div class="messages__margin" />
    </div>
    <div
      class="messages__panel displayNone"
      ref={(el) => {
        refs.panel = el
      }}
    />
    <div
      class="messages__update displayNone"
      ref={(el) => {
        refs.updateDom = el
      }}
    />
  </>
)
