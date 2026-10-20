import { h } from 'ui/jsx-runtime'

export interface NotSupportedViewProps {
  title: string
  subTitle: string
  imageUrl: string
}

export const NotSupportedView = ({ title, subTitle, imageUrl }: NotSupportedViewProps) => (
  <div class="notSupported__container">
    <img class="notSupported__image" src={imageUrl} />
    <div class="drawith_notSupported__text_container">
      <h1 class="notSupported__title">{title}</h1>
      <h4 class="notSupported__subTitle">{subTitle}</h4>
    </div>
  </div>
)
