export type JpgExportOptions = {
  filename: string;
  quality: number;
};

export function downloadCanvasAsJpg(
  canvas: HTMLCanvasElement,
  options: JpgExportOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      reject(new Error("The timetable preview is not ready yet."));
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Your browser could not create the JPG. Please try a smaller image."));
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = options.filename
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\\.jpg$/i, "") || "my-midterm-timetable";
      link.href = url;
      link.download = safeName + ".jpg";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      resolve();
    }, "image/jpeg", Math.min(1, Math.max(0.7, options.quality / 100)));
  });
}