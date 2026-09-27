/** Detect obvious unsupported containers before a browser silently rejects play().
 * A nonempty canPlayType result is only a hint, never a guarantee the actual
 * encoding, network response, or file is valid. Unknown formats stay eligible.
 */
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs="opus"',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

export function isAudioFormatSupported(audio: Pick<HTMLAudioElement, 'canPlayType'>, source: string): boolean {
  const cleanPath = source.split(/[?#]/, 1)[0];
  const extension = cleanPath.split('.').pop()?.toLowerCase() ?? '';
  const type = AUDIO_TYPES[extension];
  return !type || typeof audio.canPlayType !== 'function' || audio.canPlayType(type) !== '';
}