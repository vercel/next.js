import { matchRemotePattern, hasRemoteMatch } from './match-remote-pattern'
import type { RemotePattern } from './image-config'

describe('shared/lib/match-remote-pattern', () => {
  describe('matchRemotePattern', () => {
    describe('protocol matching', () => {
      it('should match when protocols are the same', () => {
        const pattern: RemotePattern = {
          protocol: 'https',
          hostname: 'example.com',
        }
        const url = new URL('https://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should match when protocol has trailing colon', () => {
        const pattern: RemotePattern = {
          protocol: 'https:',
          hostname: 'example.com',
        }
        const url = new URL('https://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match when protocols differ', () => {
        const pattern: RemotePattern = {
          protocol: 'https',
          hostname: 'example.com',
        }
        const url = new URL('http://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })

      it('should match when protocol is undefined', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
        }
        const url = new URL('https://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })
    })

    describe('port matching', () => {
      it('should match when ports are the same', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          port: '3000',
        }
        const url = new URL('https://example.com:3000/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match when ports differ', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          port: '3000',
        }
        const url = new URL('https://example.com:8080/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })

      it('should match when port is undefined', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
        }
        const url = new URL('https://example.com:3000/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should match default ports', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          port: '',
        }
        const url = new URL('https://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })
    })

    describe('hostname matching', () => {
      it('should match exact hostname', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
        }
        const url = new URL('https://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match different hostname', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
        }
        const url = new URL('https://other.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })

      it('should match wildcard subdomain', () => {
        const pattern: RemotePattern = {
          hostname: '**.example.com',
        }
        const url = new URL('https://cdn.example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should match nested subdomain with wildcard', () => {
        const pattern: RemotePattern = {
          hostname: '**.example.com',
        }
        const url = new URL('https://cdn.images.example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should match single wildcard subdomain', () => {
        const pattern: RemotePattern = {
          hostname: '*.example.com',
        }
        const url = new URL('https://cdn.example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match base domain with single wildcard', () => {
        const pattern: RemotePattern = {
          hostname: '*.example.com',
        }
        const url = new URL('https://example.com/image.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })

      it('should throw when hostname is undefined', () => {
        const pattern: RemotePattern = {} as any
        const url = new URL('https://example.com/image.jpg')

        expect(() => matchRemotePattern(pattern, url)).toThrow(
          'Pattern should define hostname but found'
        )
      })
    })

    describe('pathname matching', () => {
      it('should match any pathname when not specified', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
        }
        const url1 = new URL('https://example.com/path/to/image.jpg')
        const url2 = new URL('https://example.com/other/image.jpg')

        expect(matchRemotePattern(pattern, url1)).toBe(true)
        expect(matchRemotePattern(pattern, url2)).toBe(true)
      })

      it('should match exact pathname', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          pathname: '/images/photo.jpg',
        }
        const url = new URL('https://example.com/images/photo.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match different pathname', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          pathname: '/images/photo.jpg',
        }
        const url = new URL('https://example.com/other/photo.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })

      it('should match pathname with wildcards', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          pathname: '/images/**',
        }
        const url = new URL('https://example.com/images/2023/photo.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should match pathname with single wildcard', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          pathname: '/images/*.jpg',
        }
        const url = new URL('https://example.com/images/photo.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should match pathname with dot files when specified', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          pathname: '/**',
        }
        const url = new URL('https://example.com/.well-known/file')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })
    })

    describe('search/query matching', () => {
      it('should match when search is the same', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          search: '?w=100&h=100',
        }
        const url = new URL('https://example.com/image.jpg?w=100&h=100')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match when search differs', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
          search: '?w=100&h=100',
        }
        const url = new URL('https://example.com/image.jpg?w=200&h=200')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })

      it('should match when search is undefined', () => {
        const pattern: RemotePattern = {
          hostname: 'example.com',
        }
        const url = new URL('https://example.com/image.jpg?w=100')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })
    })

    describe('combined matching', () => {
      it('should match when all parts match', () => {
        const pattern: RemotePattern = {
          protocol: 'https',
          hostname: 'cdn.example.com',
          port: '443',
          pathname: '/images/**',
        }
        const url = new URL('https://cdn.example.com:443/images/2023/photo.jpg')

        expect(matchRemotePattern(pattern, url)).toBe(true)
      })

      it('should not match when one part differs', () => {
        const pattern: RemotePattern = {
          protocol: 'https',
          hostname: 'cdn.example.com',
          port: '443',
          pathname: '/images/**',
        }
        const url = new URL('https://cdn.example.com:443/videos/2023/video.mp4')

        expect(matchRemotePattern(pattern, url)).toBe(false)
      })
    })
  })

  describe('hasRemoteMatch', () => {
    it('should match when domain is in the list', () => {
      const domains = ['example.com', 'cdn.example.com']
      const remotePatterns: RemotePattern[] = []
      const url = new URL('https://example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(true)
    })

    it('should match when pattern matches', () => {
      const domains: string[] = []
      const remotePatterns: RemotePattern[] = [
        {
          hostname: '**.example.com',
        },
      ]
      const url = new URL('https://cdn.example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(true)
    })

    it('should not match when neither domain nor pattern matches', () => {
      const domains = ['other.com']
      const remotePatterns: RemotePattern[] = [
        {
          hostname: 'different.com',
        },
      ]
      const url = new URL('https://example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(false)
    })

    it('should match when at least one domain matches', () => {
      const domains = ['other.com', 'example.com']
      const remotePatterns: RemotePattern[] = []
      const url = new URL('https://example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(true)
    })

    it('should match when at least one pattern matches', () => {
      const domains: string[] = []
      const remotePatterns: RemotePattern[] = [
        {
          hostname: 'other.com',
        },
        {
          hostname: 'example.com',
        },
      ]
      const url = new URL('https://example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(true)
    })

    it('should handle empty domains and patterns', () => {
      const domains: string[] = []
      const remotePatterns: RemotePattern[] = []
      const url = new URL('https://example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(false)
    })

    it('should prioritize domain match', () => {
      const domains = ['example.com']
      const remotePatterns: RemotePattern[] = []
      const url = new URL('https://example.com/image.jpg')

      expect(hasRemoteMatch(domains, remotePatterns, url)).toBe(true)
    })
  })
})
