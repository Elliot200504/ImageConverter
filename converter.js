// This is the part that actually does the converting.
// Both the website and the command line thing use this file so I don't
// have to write the same code twice.

const sharp = require('sharp');

const FORMATS = {
  jpeg: { ext: '.jpg', mime: 'image/jpeg', aliases: ['jpg', 'jpeg'] },
  png: { ext: '.png', mime: 'image/png', aliases: ['png'] },
  webp: { ext: '.webp', mime: 'image/webp', aliases: ['webp'] },
  avif: { ext: '.avif', mime: 'image/avif', aliases: ['avif'] },
  tiff: { ext: '.tiff', mime: 'image/tiff', aliases: ['tif', 'tiff'] },
  gif: { ext: '.gif', mime: 'image/gif', aliases: ['gif'] },
};

const INPUT_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif',
  '.tif', '.tiff', '.svg', '.heic', '.heif', '.jp2',
]);

const ANIMATED = new Set(['gif', 'webp']);

const FIT_MODES = new Set(['cover', 'contain', 'fill', 'inside', 'outside']);

function resolveFormat(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().replace('.', '');

  for (const format in FORMATS) {
    if (FORMATS[format].aliases.includes(key)) {
      return format;
    }
  }
  return null;
}

function applyFormat(pipeline, format, quality) {
  if (format === 'jpeg') return pipeline.jpeg({ quality: quality, mozjpeg: true });
  if (format === 'png') return pipeline.png({ compressionLevel: 9 });
  if (format === 'webp') return pipeline.webp({ quality: quality });
  if (format === 'avif') return pipeline.avif({ quality: quality });
  if (format === 'tiff') return pipeline.tiff({ quality: quality });
  if (format === 'gif') return pipeline.gif();

  throw new Error('Unsupported format: ' + format);
}

async function convert(input, opts) {
  opts = opts || {};

  const format = resolveFormat(opts.to);
  if (!format) {
    throw new Error('Unknown target format: ' + opts.to);
  }

  const quality = opts.quality == null ? 80 : Number(opts.quality);
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error('Quality must be a number between 1 and 100');
  }

  const fit = opts.fit || 'inside';
  if (!FIT_MODES.has(fit)) {
    throw new Error('Unknown fit mode: ' + fit);
  }

  const source = await sharp(input).metadata();

  const animated = opts.animation !== false
    && ANIMATED.has(format)
    && ANIMATED.has(source.format)
    && (source.pages || 1) > 1;

  let pipeline = sharp(input, { animated: animated });

  const width = opts.width ? Number(opts.width) : null;
  const height = opts.height ? Number(opts.height) : null;

  if (width || height) {
    if ((width !== null && !(width > 0)) || (height !== null && !(height > 0))) {
      throw new Error('Width and height must be positive numbers');
    }
    pipeline = pipeline.resize({
      width: width || null,
      height: height || null,
      fit: fit,
      withoutEnlargement: true,
    });
  }

  if (opts.flatten) {
    pipeline = pipeline.flatten({ background: opts.flatten });
  } else if (format === 'jpeg') {
    pipeline = pipeline.flatten({ background: '#ffffff' });
  }

  const result = await applyFormat(pipeline, format, quality).toBuffer({ resolveWithObject: true });
  const info = result.info;

  return {
    data: result.data,
    format: format,
    width: info.width,
    height: info.height,
    pages: info.pages || 1,
    size: info.size,
    sourceFormat: source.format,
  };
}

module.exports = { FORMATS, INPUT_EXT, ANIMATED, FIT_MODES, resolveFormat, convert };
