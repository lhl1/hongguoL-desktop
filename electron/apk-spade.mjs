// Research port of supplied APK libttmplayer.so function 0xc7120 (called at 0x175b30).
// Takes the server-authorized model's opaque spade value. Never persists or prints keys.
export function decodeSpade(spade, decodeMode = 0) {
  const bytes = Buffer.from(spade, 'base64');
  if (bytes.length < 5 || bytes.length > 4096) throw new Error('Invalid spade envelope');
  const marker = bytes[0] ^ bytes[1] ^ bytes[2];
  const trailerSize = marker - 48, size = bytes.length - trailerSize - 1;
  if (trailerSize < 1 || size < 1 || trailerSize >= bytes.length - 2) throw new Error('Invalid spade envelope size');
  const trailerMask = bytes[bytes.length - trailerSize - 2] ^ bytes[bytes.length - trailerSize - 1];
  const trailer = Buffer.from(bytes.subarray(bytes.length - trailerSize).map(v => v ^ trailerMask));
  const variant = ['app_v2', 'web_v2'].some(v => trailer.equals(Buffer.from(v).subarray(0, trailerSize)));
  const payload = Buffer.from(bytes.subarray(1, 1 + size));
  const swap = () => { for (let i = 0; i + 1 < payload.length; i += 2) [payload[i], payload[i + 1]] = [payload[i + 1], payload[i]]; };
  if (variant) swap();
  let evenState = 85, oddState = 250;
  for (let i = 0; i < payload.length; i++) {
    const raw = payload[i], even = i % 2 === 0;
    const population = i.toString(2).replace(/0/g, '').length;
    const offset = (decodeMode ? 1 : -1) * (21 + population);
    const mask = even ? oddState : evenState;
    const extra = variant ? even ? evenState : oddState : 0;
    payload[i] = ((raw ^ mask) - extra + offset) & 255;
    if (even) oddState = raw; else evenState = raw;
  }
  if (variant) swap();
  const first = payload[0];
  const extraLength = first >= 48 && first <= 57 ? first - 48 : first >= 97 && first <= 122 ? first - 87 : -1;
  if (extraLength < 0 || payload.length - extraLength < 2) throw new Error('Invalid decoded spade envelope');
  const key = Buffer.from(payload.subarray(1, payload.length - extraLength));
  const extra = Buffer.from(payload.subarray(payload.length - extraLength));
  return { key, extra, envelopeVersion: trailer.toString('ascii'), decodeMode };
}
