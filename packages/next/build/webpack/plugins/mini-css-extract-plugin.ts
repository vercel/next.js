// @ts-ignore: TODO: remove when webpack 5 is stable
import MiniCssExtractPlugin from 'next/dist/compiled/mini-css-extract-plugin'

export default class NextMiniCssExtractPlugin extends MiniCssExtractPlugin {
  __next_css_remove = true
}
