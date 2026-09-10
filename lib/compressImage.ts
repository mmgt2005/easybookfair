// Client-only: resizes an image to fit within maxDimension and re-encodes
// it as WebP, run in the browser before upload so large phone photos don't
// get sent over the wire at full size. Falls back to the original file if
// anything about this fails (unsupported format, canvas/WebP unsupported)
// rather than blocking the upload entirely.
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) return file;

    const newName = file.name.replace(/\.\w+$/, "") + ".webp";
    return new File([blob], newName, { type: "image/webp" });
  } catch {
    return file;
  }
}
