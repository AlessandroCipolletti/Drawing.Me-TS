import { h, Fragment } from 'ui/jsx-runtime'

export interface ToolItemData {
  name: string
  disabled: boolean
  versions: Array<{ name: string; props: { image?: unknown } }> | false
}

export interface ToolsRefs {
  toolsContainer: HTMLElement | null
  versionsContainer: HTMLElement | null
  toolsButtons: Record<string, HTMLElement>
  toolsVersions: Record<string, HTMLElement>
}

export const ToolsView = ({ toolsData, refs }: { toolsData: ToolItemData[]; refs: ToolsRefs }) => (
  <>
    <div
      class="editor-tools__container"
      ref={(el) => {
        refs.toolsContainer = el
      }}
    >
      {toolsData.map((tool) => (
        <div
          class={`editor-tools__tool editor-tools__tool-${tool.name}${tool.disabled ? ' disabled' : ''}`}
          data-tool={tool.name}
          ref={(el) => {
            refs.toolsButtons[tool.name] = el
          }}
        />
      ))}
    </div>

    <div
      class="editor-tools__versions-container"
      ref={(el) => {
        refs.versionsContainer = el
      }}
    >
      {toolsData.map((tool) =>
        tool.versions && tool.versions.length > 0 ? (
          <div
            class={`editor-tools__versions editor-tools__versions-${tool.name}`}
            ref={(el) => {
              refs.toolsVersions[tool.name] = el
            }}
          >
            {tool.versions.map((ver, idx) => (
              <div
                class={`editor-tools__versions-button${ver.props.image ? ' editor-tools__versions-button-image' : ''}`}
                data-versionsIndex={String(idx)}
                data-tool={tool.name}
              >
                <p>{ver.name}</p>
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  </>
)
