const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FORMAT_CACHE = new Map<string, boolean>();

export interface ImageVariantSet {
  thumbnail: string;
  medium: string;
  original: string;
  format: 'image/avif' | 'image/webp' | 'image/jpeg';
}

export function validateSafeImageFile(file: File) {
  if (!SAFE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, WebP, AVIF, GIF, or BMP images can be uploaded');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Please use an image smaller than 8 MB');
  }
}

export async function compressImageFile(file: File, maxSize = 1200, quality = 0.82): Promise<string> {
  validateSafeImageFile(file);
  const variants = await createImageVariants(file, { mediumSize: maxSize, mediumQuality: quality });
  return variants.medium;
}

export async function compressDataUrl(dataUrl: string, maxSize = 1200, quality = 0.82): Promise<string> {
  if (!dataUrl.trim()) {
    throw new Error('Image data is empty');
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (!SAFE_IMAGE_TYPES.has(blob.type)) {
    throw new Error('Only JPG, PNG, WebP, AVIF, GIF, or BMP images can be compressed');
  }

  const bitmap = await createImageBitmap(blob);
  const format = await getBestOutputFormat();

  try {
    return renderVariant(bitmap, maxSize, quality, format);
  } finally {
    bitmap.close?.();
  }
}

async function browserSupportsImageFormat(type: 'image/avif' | 'image/webp') {
  if (IMAGE_FORMAT_CACHE.has(type)) return IMAGE_FORMAT_CACHE.get(type)!;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const supported = canvas.toDataURL(type).startsWith(`data:${type}`);
  IMAGE_FORMAT_CACHE.set(type, supported);
  return supported;
}

async function getBestOutputFormat(): Promise<ImageVariantSet['format']> {
  if (await browserSupportsImageFormat('image/avif')) return 'image/avif';
  if (await browserSupportsImageFormat('image/webp')) return 'image/webp';
  return 'image/jpeg';
}

async function renderVariant(bitmap: ImageBitmap, maxSize: number, quality: number, format: ImageVariantSet['format']) {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: format !== 'image/jpeg' });
  if (!ctx) throw new Error('Image processing is not supported in this browser');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL(format, quality);
}

export async function createImageVariants(
  file: File,
  options: {
    thumbnailSize?: number;
    mediumSize?: number;
    originalSize?: number;
    thumbnailQuality?: number;
    mediumQuality?: number;
    originalQuality?: number;
  } = {}
): Promise<ImageVariantSet> {
  validateSafeImageFile(file);

  const bitmap = await createImageBitmap(file);
  const format = await getBestOutputFormat();

  try {
    const [thumbnail, medium, original] = await Promise.all([
      renderVariant(bitmap, options.thumbnailSize ?? 160, options.thumbnailQuality ?? 0.76, format),
      renderVariant(bitmap, options.mediumSize ?? 720, options.mediumQuality ?? 0.8, format),
      renderVariant(bitmap, options.originalSize ?? 1600, options.originalQuality ?? 0.86, format),
    ]);

    return { thumbnail, medium, original, format };
  } finally {
    bitmap.close?.();
  }
}
