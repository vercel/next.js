import Head from 'next/head'

export const config = { amp: true }

export default () => (
  <>
    <Head>
      <title>Example AMP Story in Next.js</title>
      <script
        async
        key="amp-story"
        custom-element="amp-story"
        src="https://cdn.ampproject.org/v0/amp-story-1.0.js"
      />
      <script
        async
        key="amp-video"
        custom-element="amp-video"
        src="https://cdn.ampproject.org/v0/amp-video-0.1.js"
      />
    </Head>

    <amp-story
      standalone=""
      title="Stories in AMP - Hello World"
      publisher="AMP Project"
      publisher-logo-src="https://amp.dev/favicons/coast-228x228.png"
      poster-portrait-src="https://amp.dev/static/samples/img/story_dog2_portrait.jpg"
      poster-square-src="https://amp.dev/static/samples/img/story_dog2_square.jpg"
      poster-landscape-src="https://amp.dev/static/samples/img/story_dog2_landscape.jpg"
    >
      {/* <!-- A story consists of one or more pages. Each page is declared by an `amp-story-page` element. Pages are designed by layering videos, images and text. Here we have a page that uses two layers. One layer filling the available space with an image and one text layer that shows a heading. --> */}
      <amp-story-page id="page-1">
        <amp-story-grid-layer template="fill">
          <amp-img
            src="https://amp.dev/static/samples/img/story_dog2.jpg"
            width="720"
            height="1280"
            layout="responsive"
          />
        </amp-story-grid-layer>
        <amp-story-grid-layer template="vertical">
          <h1>Hello World</h1>
          <p>This is an AMP Story.</p>
        </amp-story-grid-layer>
      </amp-story-page>

      {/* <!-- Here we have a page consisting of a video which autoplays and loops. --> */}
      <amp-story-page id="page-2">
        <amp-story-grid-layer template="fill">
          <amp-video
            autoplay=""
            loop=""
            width="720"
            height="960"
            poster="https://amp.dev/static/samples/img/story_video_dog_cover.jpg"
            layout="responsive"
          >
            <source
              src="https://amp.dev/static/samples/video/story_video_dog.mp4"
              type="video/mp4"
            />
          </amp-video>
        </amp-story-grid-layer>
      </amp-story-page>

      {/* <!-- Pre-defined entry animations make it possible to create dynamic pages without videos. The length and initial delay can be customized using the `animate-in-duration` and `animate-in-delay` properties. The [animations sample](/documentation/examples/visual-effects/amp_story_animations/) shows all available animantions in action. --> */}
      <amp-story-page id="animation-demo">
        <amp-story-grid-layer template="fill">
          <amp-img
            src="https://amp.dev/static/samples/img/story_dog4.jpg"
            animate-in="fly-in-top"
            width="720"
            height="1280"
            layout="responsive"
          />
        </amp-story-grid-layer>
        <amp-story-grid-layer template="thirds">
          <h2
            animate-in="fly-in-bottom"
            grid-area="lower-third"
            animate-in-delay="0.4s"
          >
            Best walk ever!
          </h2>
        </amp-story-grid-layer>
      </amp-story-page>

      {/* <!-- Stories can use predefined layouts to style the page. Here we're using the `thirds` template. For an overview about the available layouts take a look at the [layouts sample](/documentation/examples/style-layout/amp_story_layouts/). --> */}
      <amp-story-page id="layout-demo">
        <amp-story-grid-layer template="thirds">
          <amp-img
            grid-area="upper-third"
            src="https://amp.dev/static/samples/img/story_thirds_1.jpg"
            width="560"
            height="420"
            layout="responsive"
          />
          <amp-img
            grid-area="middle-third"
            src="https://amp.dev/static/samples/img/story_thirds_2.jpg"
            width="560"
            height="420"
            layout="responsive"
          />
          <amp-img
            grid-area="lower-third"
            src="https://amp.dev/static/samples/img/story_thirds_3.jpg"
            width="560"
            height="420"
            layout="responsive"
          />
        </amp-story-grid-layer>
      </amp-story-page>

      {/* <!-- A "bookend" panel containing links to other resources will appear on the last page of your story if you include an `amp-story-bookend` that references a [bookend JSON config](/static/samples/json/bookend.json). --> */}
      <amp-story-bookend
        src="https://amp.dev/static/samples/json/bookend.json"
        layout="nodisplay"
      />
    </amp-story>
  </>
)
