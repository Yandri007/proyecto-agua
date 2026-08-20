const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

const pngSize = (buffer) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const jpegSize = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const frameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (frameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3)
      };
    }
    offset += segmentLength;
  }
  return null;
};

const parseImageDataUrl = (value, {
  maxBytes,
  maxWidth,
  maxHeight,
  maxPixels = maxWidth * maxHeight
}) => {
  if (typeof value !== 'string') throw new Error('La imagen es obligatoria');
  const match = value.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !ALLOWED_IMAGE_TYPES.has(match[1]) || match[2].length % 4 !== 0) {
    throw new Error('Usa una imagen JPG o PNG valida');
  }

  const data = Buffer.from(match[2], 'base64');
  const canonical = data.toString('base64').replace(/=+$/, '');
  if (canonical !== match[2].replace(/=+$/, '') || data.length === 0 || data.length > maxBytes) {
    throw new Error(`La imagen supera el limite de ${Math.floor(maxBytes / 1024)} KB`);
  }

  const size = match[1] === 'image/png' ? pngSize(data) : jpegSize(data);
  if (!size || size.width < 1 || size.height < 1
      || size.width > maxWidth || size.height > maxHeight
      || size.width * size.height > maxPixels) {
    throw new Error(`La imagen no puede superar ${maxWidth} x ${maxHeight} pixeles`);
  }
  return { data, mime: match[1], ...size };
};

module.exports = { parseImageDataUrl };
