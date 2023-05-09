/**
 * @file An AMP Component import helper. This file is auto-generated using
 * https://www.npmjs.com/package/@ampproject/toolbox-validator-rules.
 */
import Head from 'next/head'

interface Props {
  name: string
  version: string
}

export function AmpIncludeCustomElement(props: Props) {
  return (
    <Head>
      <script
        async
        custom-element={props.name}
        src={
          'https://cdn.ampproject.org/v0/' +
          props.name +
          '-' +
          props.version +
          '.js'
        }
        key={props.name}
      />
    </Head>
  )
}

export function AmpIncludeCustomTemplate(props: Props) {
  return (
    <Head>
      <script
        async
        custom-template={props.name}
        src={
          'https://cdn.ampproject.org/v0/' +
          props.name +
          '-' +
          props.version +
          '.js'
        }
        key={props.name}
      />
    </Head>
  )
}

export function AmpIncludeAmp3dGltf() {
  return <AmpIncludeCustomElement name="amp-3d-gltf" version="0.1" />
}

export function AmpIncludeAmp3qPlayer() {
  return <AmpIncludeCustomElement name="amp-3q-player" version="0.1" />
}

export function AmpIncludeAmpAccessLaterpay() {
  return <AmpIncludeCustomElement name="amp-access-laterpay" version="0.2" />
}

export function AmpIncludeAmpAccessPoool() {
  return <AmpIncludeCustomElement name="amp-access-poool" version="0.1" />
}

export function AmpIncludeAmpAccessScroll() {
  return <AmpIncludeCustomElement name="amp-access-scroll" version="0.1" />
}

export function AmpIncludeAmpAccess() {
  return <AmpIncludeCustomElement name="amp-access" version="0.1" />
}

export function AmpIncludeAmpAccordion() {
  return <AmpIncludeCustomElement name="amp-accordion" version="0.1" />
}

export function AmpIncludeAmpActionMacro() {
  return <AmpIncludeCustomElement name="amp-action-macro" version="0.1" />
}

export function AmpIncludeAmpAdCustom() {
  return <AmpIncludeCustomElement name="amp-ad-custom" version="0.1" />
}

export function AmpIncludeAmpAd() {
  return <AmpIncludeCustomElement name="amp-ad" version="0.1" />
}

export function AmpIncludeAmpAddthis() {
  return <AmpIncludeCustomElement name="amp-addthis" version="0.1" />
}

export function AmpIncludeAmpAnalytics() {
  return <AmpIncludeCustomElement name="amp-analytics" version="0.1" />
}

export function AmpIncludeAmpAnim() {
  return <AmpIncludeCustomElement name="amp-anim" version="0.1" />
}

export function AmpIncludeAmpAnimation() {
  return <AmpIncludeCustomElement name="amp-animation" version="0.1" />
}

export function AmpIncludeAmpApesterMedia() {
  return <AmpIncludeCustomElement name="amp-apester-media" version="0.1" />
}

export function AmpIncludeAmpAppBanner() {
  return <AmpIncludeCustomElement name="amp-app-banner" version="0.1" />
}

export function AmpIncludeAmpAudio() {
  return <AmpIncludeCustomElement name="amp-audio" version="0.1" />
}

export function AmpIncludeAmpAutoAds() {
  return <AmpIncludeCustomElement name="amp-auto-ads" version="0.1" />
}

export function AmpIncludeAmpAutocomplete() {
  return <AmpIncludeCustomElement name="amp-autocomplete" version="0.1" />
}

export function AmpIncludeAmpBaseCarousel() {
  return <AmpIncludeCustomElement name="amp-base-carousel" version="0.1" />
}

export function AmpIncludeAmpBeopinion() {
  return <AmpIncludeCustomElement name="amp-beopinion" version="0.1" />
}

export function AmpIncludeAmpBind() {
  return <AmpIncludeCustomElement name="amp-bind" version="0.1" />
}

export function AmpIncludeAmpBodymovinAnimation() {
  return (
    <AmpIncludeCustomElement name="amp-bodymovin-animation" version="0.1" />
  )
}

export function AmpIncludeAmpBridPlayer() {
  return <AmpIncludeCustomElement name="amp-brid-player" version="0.1" />
}

export function AmpIncludeAmpBrightcove() {
  return <AmpIncludeCustomElement name="amp-brightcove" version="0.1" />
}

export function AmpIncludeAmpBysideContent() {
  return <AmpIncludeCustomElement name="amp-byside-content" version="0.1" />
}

export function AmpIncludeAmpCallTracking() {
  return <AmpIncludeCustomElement name="amp-call-tracking" version="0.1" />
}

export function AmpIncludeAmpCarousel() {
  return <AmpIncludeCustomElement name="amp-carousel" version="0.2" />
}

export function AmpIncludeAmpConnatixPlayer() {
  return <AmpIncludeCustomElement name="amp-connatix-player" version="0.1" />
}

export function AmpIncludeAmpConsent() {
  return <AmpIncludeCustomElement name="amp-consent" version="0.1" />
}

export function AmpIncludeAmpDailymotion() {
  return <AmpIncludeCustomElement name="amp-dailymotion" version="0.1" />
}

export function AmpIncludeAmpDateCountdown() {
  return <AmpIncludeCustomElement name="amp-date-countdown" version="0.1" />
}

export function AmpIncludeAmpDateDisplay() {
  return <AmpIncludeCustomElement name="amp-date-display" version="0.1" />
}

export function AmpIncludeAmpDatePicker() {
  return <AmpIncludeCustomElement name="amp-date-picker" version="0.1" />
}

export function AmpIncludeAmpDelightPlayer() {
  return <AmpIncludeCustomElement name="amp-delight-player" version="0.1" />
}

export function AmpIncludeAmpDynamicCssClasses() {
  return (
    <AmpIncludeCustomElement name="amp-dynamic-css-classes" version="0.1" />
  )
}

export function AmpIncludeAmpEmbedlyCard() {
  return <AmpIncludeCustomElement name="amp-embedly-card" version="0.1" />
}

export function AmpIncludeAmpExperiment() {
  return <AmpIncludeCustomElement name="amp-experiment" version="1.0" />
}

export function AmpIncludeAmpFacebookComments() {
  return <AmpIncludeCustomElement name="amp-facebook-comments" version="0.1" />
}

export function AmpIncludeAmpFacebookLike() {
  return <AmpIncludeCustomElement name="amp-facebook-like" version="0.1" />
}

export function AmpIncludeAmpFacebookPage() {
  return <AmpIncludeCustomElement name="amp-facebook-page" version="0.1" />
}

export function AmpIncludeAmpFacebook() {
  return <AmpIncludeCustomElement name="amp-facebook" version="0.1" />
}

export function AmpIncludeAmpFitText() {
  return <AmpIncludeCustomElement name="amp-fit-text" version="0.1" />
}

export function AmpIncludeAmpFont() {
  return <AmpIncludeCustomElement name="amp-font" version="0.1" />
}

export function AmpIncludeAmpForm() {
  return <AmpIncludeCustomElement name="amp-form" version="0.1" />
}

export function AmpIncludeAmpFxCollection() {
  return <AmpIncludeCustomElement name="amp-fx-collection" version="0.1" />
}

export function AmpIncludeAmpFxFlyingCarpet() {
  return <AmpIncludeCustomElement name="amp-fx-flying-carpet" version="0.1" />
}

export function AmpIncludeAmpGeo() {
  return <AmpIncludeCustomElement name="amp-geo" version="0.1" />
}

export function AmpIncludeAmpGfycat() {
  return <AmpIncludeCustomElement name="amp-gfycat" version="0.1" />
}

export function AmpIncludeAmpGist() {
  return <AmpIncludeCustomElement name="amp-gist" version="0.1" />
}

export function AmpIncludeAmpGoogleDocumentEmbed() {
  return (
    <AmpIncludeCustomElement name="amp-google-document-embed" version="0.1" />
  )
}

export function AmpIncludeAmpHulu() {
  return <AmpIncludeCustomElement name="amp-hulu" version="0.1" />
}

export function AmpIncludeAmpIframe() {
  return <AmpIncludeCustomElement name="amp-iframe" version="0.1" />
}

export function AmpIncludeAmpImaVideo() {
  return <AmpIncludeCustomElement name="amp-ima-video" version="0.1" />
}

export function AmpIncludeAmpImageLightbox() {
  return <AmpIncludeCustomElement name="amp-image-lightbox" version="0.1" />
}

export function AmpIncludeAmpImageSlider() {
  return <AmpIncludeCustomElement name="amp-image-slider" version="0.1" />
}

export function AmpIncludeAmpImgur() {
  return <AmpIncludeCustomElement name="amp-imgur" version="0.1" />
}

export function AmpIncludeAmpInputmask() {
  return <AmpIncludeCustomElement name="amp-inputmask" version="0.1" />
}

export function AmpIncludeAmpInstagram() {
  return <AmpIncludeCustomElement name="amp-instagram" version="0.1" />
}

export function AmpIncludeAmpInstallServiceworker() {
  return (
    <AmpIncludeCustomElement name="amp-install-serviceworker" version="0.1" />
  )
}

export function AmpIncludeAmpIzlesene() {
  return <AmpIncludeCustomElement name="amp-izlesene" version="0.1" />
}

export function AmpIncludeAmpJwplayer() {
  return <AmpIncludeCustomElement name="amp-jwplayer" version="0.1" />
}

export function AmpIncludeAmpKalturaPlayer() {
  return <AmpIncludeCustomElement name="amp-kaltura-player" version="0.1" />
}

export function AmpIncludeAmpLightboxGallery() {
  return <AmpIncludeCustomElement name="amp-lightbox-gallery" version="0.1" />
}

export function AmpIncludeAmpLightbox() {
  return <AmpIncludeCustomElement name="amp-lightbox" version="0.1" />
}

export function AmpIncludeAmpLinkRewriter() {
  return <AmpIncludeCustomElement name="amp-link-rewriter" version="0.1" />
}

export function AmpIncludeAmpMustache() {
  return <AmpIncludeCustomTemplate name="amp-mustache" version="0.2" />
}

export function AmpIncludeAmpList() {
  return (
    <>
      <AmpIncludeAmpMustache />
      <AmpIncludeCustomElement name="amp-list" version="0.1" />
    </>
  )
}

export function AmpIncludeAmpLiveList() {
  return <AmpIncludeCustomElement name="amp-live-list" version="0.1" />
}

export function AmpIncludeAmpMathml() {
  return <AmpIncludeCustomElement name="amp-mathml" version="0.1" />
}

export function AmpIncludeAmpMegaphone() {
  return <AmpIncludeCustomElement name="amp-megaphone" version="0.1" />
}

export function AmpIncludeAmpMinuteMediaPlayer() {
  return (
    <AmpIncludeCustomElement name="amp-minute-media-player" version="0.1" />
  )
}

export function AmpIncludeAmpMowplayer() {
  return <AmpIncludeCustomElement name="amp-mowplayer" version="0.1" />
}

export function AmpIncludeAmpNextPage() {
  return <AmpIncludeCustomElement name="amp-next-page" version="0.1" />
}

export function AmpIncludeAmpNexxtvPlayer() {
  return <AmpIncludeCustomElement name="amp-nexxtv-player" version="0.1" />
}

export function AmpIncludeAmpO2Player() {
  return <AmpIncludeCustomElement name="amp-o2-player" version="0.1" />
}

export function AmpIncludeAmpOoyalaPlayer() {
  return <AmpIncludeCustomElement name="amp-ooyala-player" version="0.1" />
}

export function AmpIncludeAmpOrientationObserver() {
  return (
    <AmpIncludeCustomElement name="amp-orientation-observer" version="0.1" />
  )
}

export function AmpIncludeAmpPanZoom() {
  return <AmpIncludeCustomElement name="amp-pan-zoom" version="0.1" />
}

export function AmpIncludeAmpPinterest() {
  return <AmpIncludeCustomElement name="amp-pinterest" version="0.1" />
}

export function AmpIncludeAmpPlaybuzz() {
  return <AmpIncludeCustomElement name="amp-playbuzz" version="0.1" />
}

export function AmpIncludeAmpPositionObserver() {
  return <AmpIncludeCustomElement name="amp-position-observer" version="0.1" />
}

export function AmpIncludeAmpPowrPlayer() {
  return <AmpIncludeCustomElement name="amp-powr-player" version="0.1" />
}

export function AmpIncludeAmpReachPlayer() {
  return <AmpIncludeCustomElement name="amp-reach-player" version="0.1" />
}

export function AmpIncludeAmpRecaptchaInput() {
  return <AmpIncludeCustomElement name="amp-recaptcha-input" version="0.1" />
}

export function AmpIncludeAmpReddit() {
  return <AmpIncludeCustomElement name="amp-reddit" version="0.1" />
}

export function AmpIncludeAmpRiddleQuiz() {
  return <AmpIncludeCustomElement name="amp-riddle-quiz" version="0.1" />
}

export function AmpIncludeAmpScript() {
  return <AmpIncludeCustomElement name="amp-script" version="0.1" />
}

export function AmpIncludeAmpSelector() {
  return <AmpIncludeCustomElement name="amp-selector" version="0.1" />
}

export function AmpIncludeAmpSidebar() {
  return <AmpIncludeCustomElement name="amp-sidebar" version="0.1" />
}

export function AmpIncludeAmpSkimlinks() {
  return <AmpIncludeCustomElement name="amp-skimlinks" version="0.1" />
}

export function AmpIncludeAmpSlides() {
  return <AmpIncludeCustomElement name="amp-slides" version="0.1" />
}

export function AmpIncludeAmpSmartlinks() {
  return <AmpIncludeCustomElement name="amp-smartlinks" version="0.1" />
}

export function AmpIncludeAmpSocialShare() {
  return <AmpIncludeCustomElement name="amp-social-share" version="0.1" />
}

export function AmpIncludeAmpSoundcloud() {
  return <AmpIncludeCustomElement name="amp-soundcloud" version="0.1" />
}

export function AmpIncludeAmpSpringboardPlayer() {
  return <AmpIncludeCustomElement name="amp-springboard-player" version="0.1" />
}

export function AmpIncludeAmpStickyAd() {
  return <AmpIncludeCustomElement name="amp-sticky-ad" version="1.0" />
}

export function AmpIncludeAmpStoryAutoAds() {
  return <AmpIncludeCustomElement name="amp-story-auto-ads" version="0.1" />
}

export function AmpIncludeAmpStory() {
  return <AmpIncludeCustomElement name="amp-story" version="1.0" />
}

export function AmpIncludeAmpSubscriptions() {
  return <AmpIncludeCustomElement name="amp-subscriptions" version="0.1" />
}

export function AmpIncludeAmpSubscriptionsGoogle() {
  return (
    <AmpIncludeCustomElement name="amp-subscriptions-google" version="0.1" />
  )
}

export function AmpIncludeAmpTimeago() {
  return <AmpIncludeCustomElement name="amp-timeago" version="0.1" />
}

export function AmpIncludeAmpTruncateText() {
  return <AmpIncludeCustomElement name="amp-truncate-text" version="0.1" />
}

export function AmpIncludeAmpTwitter() {
  return <AmpIncludeCustomElement name="amp-twitter" version="0.1" />
}

export function AmpIncludeAmpUserLocation() {
  return <AmpIncludeCustomElement name="amp-user-location" version="0.1" />
}

export function AmpIncludeAmpUserNotification() {
  return <AmpIncludeCustomElement name="amp-user-notification" version="0.1" />
}

export function AmpIncludeAmpVideoDocking() {
  return <AmpIncludeCustomElement name="amp-video-docking" version="0.1" />
}

export function AmpIncludeAmpVideoIframe() {
  return <AmpIncludeCustomElement name="amp-video-iframe" version="0.1" />
}

export function AmpIncludeAmpVideo() {
  return <AmpIncludeCustomElement name="amp-video" version="0.1" />
}

export function AmpIncludeAmpVimeo() {
  return <AmpIncludeCustomElement name="amp-vimeo" version="0.1" />
}

export function AmpIncludeAmpVine() {
  return <AmpIncludeCustomElement name="amp-vine" version="0.1" />
}

export function AmpIncludeAmpViqeoPlayer() {
  return <AmpIncludeCustomElement name="amp-viqeo-player" version="0.1" />
}

export function AmpIncludeAmpVk() {
  return <AmpIncludeCustomElement name="amp-vk" version="0.1" />
}

export function AmpIncludeAmpWebPush() {
  return <AmpIncludeCustomElement name="amp-web-push" version="0.1" />
}

export function AmpIncludeAmpWistiaPlayer() {
  return <AmpIncludeCustomElement name="amp-wistia-player" version="0.1" />
}

export function AmpIncludeAmpYotpo() {
  return <AmpIncludeCustomElement name="amp-yotpo" version="0.1" />
}

export function AmpIncludeAmpYoutube() {
  return <AmpIncludeCustomElement name="amp-youtube" version="0.1" />
}
