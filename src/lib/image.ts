// Compress an image (File or video frame) into a small JPEG data URL.
const MAX = 420;

function drawToDataUrl(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, MAX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => resolve(drawToDataUrl(img, img.naturalWidth, img.naturalHeight));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function captureVideoFrame(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth) return null;
  try {
    return drawToDataUrl(video, video.videoWidth, video.videoHeight);
  } catch {
    return null;
  }
}
