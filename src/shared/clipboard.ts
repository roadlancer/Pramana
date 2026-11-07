async function toPng(image: Blob): Promise<Blob> {
  if (image.type === 'image/png') return image;
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

/**
 * Copies an image so it can be pasted into chat apps, docs and email.
 * Chrome's clipboard only takes PNG, so other formats are converted. The image may be a promise:
 * handing the clipboard a promise keeps the click's permission while the image is still being made.
 */
export async function copyImageToClipboard(image: Blob | Promise<Blob>): Promise<void> {
  // Missing on http:// pages, which the on-page editor can run on
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error("This page doesn't allow copying images");
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(image).then(toPng) })]);
}
