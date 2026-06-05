const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateSafeImageFile(file: File) {
  if (!SAFE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, WebP, GIF, or BMP images can be uploaded');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Please use an image smaller than 8 MB');
  }
}

export async function compressImageFile(file: File, maxSize = 1200, quality = 0.82): Promise<string> {
  validateSafeImageFile(file);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image compression is not supported in this browser');

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', quality);
}
