import { encodeMojibake, decodeMojibake } from './mojibake'

describe('Mojibake encoding/decoding', () => {
  describe('encodeMojibake', () => {
    it('should convert UTF-8 to Mojibake representation', () => {
      // "Montréal" UTF-8 bytes interpreted as Latin-1
      expect(encodeMojibake('Montréal')).toBe('MontrÃ©al')
      expect(encodeMojibake('café')).toBe('cafÃ©')
      expect(encodeMojibake('München')).toBe('MÃ¼nchen')
    })

    it('should return ASCII strings unchanged', () => {
      expect(encodeMojibake('hello')).toBe('hello')
      expect(encodeMojibake('test-123')).toBe('test-123')
    })

    it('should handle multi-byte UTF-8 characters', () => {
      // Japanese "こんにちは" becomes longer when each UTF-8 byte is a Latin-1 char
      const encoded = encodeMojibake('こんにちは')
      expect(encoded.length).toBeGreaterThan('こんにちは'.length)
    })
  })

  describe('decodeMojibake', () => {
    it('should recover UTF-8 from Mojibake', () => {
      expect(decodeMojibake('MontrÃ©al')).toBe('Montréal')
      expect(decodeMojibake('cafÃ©')).toBe('café')
      expect(decodeMojibake('MÃ¼nchen')).toBe('München')
    })

    it('should return ASCII strings unchanged', () => {
      expect(decodeMojibake('hello')).toBe('hello')
      expect(decodeMojibake('test-123')).toBe('test-123')
    })

    it('should return original if not valid Mojibake', () => {
      // Invalid UTF-8 sequence should return original
      expect(decodeMojibake('\xFF\xFE')).toBe('\xFF\xFE')
    })

    it('should handle already-valid UTF-8 strings', () => {
      // If the string is already valid UTF-8 and not Mojibake, return as-is
      expect(decodeMojibake('Montréal')).toBe('Montréal')
    })
  })

  describe('round-trip', () => {
    const testCases = [
      'Montréal',
      'café',
      'München',
      'España',
      'Île-de-France',
      'Österreich',
      'São Paulo',
      'Malmö',
      'København',
      'Grüß Gott',
      'こんにちは',
      '北京',
      'Москва',
    ]

    it.each(testCases)('should round-trip encode/decode: %s', (original) => {
      const encoded = encodeMojibake(original)
      const decoded = decodeMojibake(encoded)
      expect(decoded).toBe(original)
    })
  })
})
