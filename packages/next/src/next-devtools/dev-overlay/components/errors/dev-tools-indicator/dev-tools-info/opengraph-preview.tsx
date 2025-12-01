import { useEffect, useState } from 'react'
import { css } from '../../../../utils/css'

interface OpenGraphData {
  title?: string
  description?: string
  image?: string
  url?: string
  siteName?: string
  type?: string
}

function fetchOpenGraphData(): OpenGraphData {
  const getMetaContent = (property: string): string | undefined => {
    const meta = document.querySelector(
      `meta[property="${property}"], meta[name="${property}"]`
    )
    return meta?.getAttribute('content') || undefined
  }

  return {
    title:
      getMetaContent('og:title') ||
      document.querySelector('title')?.textContent ||
      undefined,
    description: getMetaContent('og:description') || getMetaContent('description'),
    image: getMetaContent('og:image'),
    url: getMetaContent('og:url') || window.location.href,
    siteName: getMetaContent('og:site_name'),
    type: getMetaContent('og:type'),
  }
}

function TwitterPreview({ data }: { data: OpenGraphData }) {
  const twitterCard =
    document
      .querySelector('meta[name="twitter:card"]')
      ?.getAttribute('content') || 'summary_large_image'

  return (
    <div className="social-preview-card twitter-preview">
      <div className="social-preview-header">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ color: '#1DA1F2' }}
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span className="social-preview-platform">Twitter / X</span>
      </div>
      {data.image && (
        <div className="social-preview-image-container">
          <img
            src={data.image}
            alt={data.title || 'Preview'}
            className="social-preview-image"
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="social-preview-content">
        <div className="social-preview-domain">
          {data.url ? new URL(data.url).hostname : window.location.hostname}
        </div>
        <div className="social-preview-title">{data.title || 'No title'}</div>
        {data.description && (
          <div className="social-preview-description">{data.description}</div>
        )}
      </div>
    </div>
  )
}

function FacebookPreview({ data }: { data: OpenGraphData }) {
  return (
    <div className="social-preview-card facebook-preview">
      <div className="social-preview-header">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ color: '#1877F2' }}
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        <span className="social-preview-platform">Facebook</span>
      </div>
      {data.image && (
        <div className="social-preview-image-container">
          <img
            src={data.image}
            alt={data.title || 'Preview'}
            className="social-preview-image"
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="social-preview-content">
        <div className="social-preview-domain">
          {data.url ? new URL(data.url).hostname.toUpperCase() : window.location.hostname.toUpperCase()}
        </div>
        <div className="social-preview-title">{data.title || 'No title'}</div>
        {data.description && (
          <div className="social-preview-description">{data.description}</div>
        )}
      </div>
    </div>
  )
}

function LinkedInPreview({ data }: { data: OpenGraphData }) {
  return (
    <div className="social-preview-card linkedin-preview">
      <div className="social-preview-header">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ color: '#0A66C2' }}
        >
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
        <span className="social-preview-platform">LinkedIn</span>
      </div>
      {data.image && (
        <div className="social-preview-image-container">
          <img
            src={data.image}
            alt={data.title || 'Preview'}
            className="social-preview-image"
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="social-preview-content">
        <div className="social-preview-title">{data.title || 'No title'}</div>
        <div className="social-preview-domain">
          {data.url ? new URL(data.url).hostname : window.location.hostname}
        </div>
      </div>
    </div>
  )
}

export function OpenGraphPreviewBody() {
  const [ogData, setOgData] = useState<OpenGraphData | null>(null)

  useEffect(() => {
    const data = fetchOpenGraphData()
    setOgData(data)
  }, [])

  if (!ogData) {
    return (
      <div className="opengraph-loading">
        <p>Loading OpenGraph data...</p>
      </div>
    )
  }

  const hasData = ogData.title || ogData.description || ogData.image

  return (
    <>
      <article className="dev-tools-info-article">
        <p className="dev-tools-info-paragraph">
          Preview how your page will appear when shared on social media
          platforms. OpenGraph tags control the title, description, and image
          displayed in social shares.
        </p>
        {!hasData && (
          <p
            className="dev-tools-info-paragraph"
            style={{ color: 'var(--color-gray-900)' }}
          >
            <strong>No OpenGraph tags detected.</strong> Add{' '}
            <code className="dev-tools-info-code">og:title</code>,{' '}
            <code className="dev-tools-info-code">og:description</code>, and{' '}
            <code className="dev-tools-info-code">og:image</code> meta tags to
            your page to improve social sharing.
          </p>
        )}
      </article>

      <div className="opengraph-previews-container">
        <TwitterPreview data={ogData} />
        <FacebookPreview data={ogData} />
        <LinkedInPreview data={ogData} />
      </div>

      <style>{css`
        .opengraph-loading {
          padding: 20px;
          text-align: center;
          color: var(--color-gray-900);
        }

        .opengraph-previews-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          padding-top: 8px;
        }

        .social-preview-card {
          background: var(--color-background-100);
          border: 1px solid var(--color-gray-alpha-400);
          border-radius: var(--rounded-lg);
          overflow: hidden;
          transition: box-shadow 0.2s;
        }

        .social-preview-card:hover {
          box-shadow: var(--shadow-md);
        }

        .social-preview-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: var(--color-background-200);
          border-bottom: 1px solid var(--color-gray-alpha-400);
        }

        .social-preview-platform {
          font-size: var(--size-13);
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .social-preview-image-container {
          width: 100%;
          max-height: 200px;
          overflow: hidden;
          background: var(--color-gray-400);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .social-preview-image {
          width: 100%;
          height: auto;
          object-fit: cover;
        }

        .social-preview-content {
          padding: 12px;
        }

        .social-preview-domain {
          font-size: var(--size-12);
          color: var(--color-gray-900);
          margin-bottom: 4px;
        }

        .social-preview-title {
          font-size: var(--size-14);
          font-weight: 600;
          color: var(--color-text-primary);
          margin-bottom: 4px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .social-preview-description {
          font-size: var(--size-13);
          color: var(--color-gray-900);
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .dev-tools-info-article {
          padding: 16px;
          padding-bottom: 8px;
        }

        .dev-tools-info-paragraph {
          margin: 0 0 12px 0;
          font-size: var(--size-13);
          line-height: 1.5;
          color: var(--color-gray-900);
        }

        .dev-tools-info-paragraph:last-child {
          margin-bottom: 0;
        }

        .dev-tools-info-code {
          background: var(--color-gray-400);
          color: var(--color-gray-1000);
          font-family: var(--font-stack-monospace);
          padding: 2px 4px;
          margin: 0;
          font-size: var(--size-13);
          white-space: break-spaces;
          border-radius: var(--rounded-md-2);
        }

        .twitter-preview {
          border-left: 3px solid #1da1f2;
        }

        .facebook-preview {
          border-left: 3px solid #1877f2;
        }

        .linkedin-preview {
          border-left: 3px solid #0a66c2;
        }
      `}</style>
    </>
  )
}
