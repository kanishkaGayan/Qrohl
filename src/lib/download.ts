function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svgElement: SVGSVGElement, fileName: string): void {
  const source = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, fileName);
}

export function downloadPngFromCanvas(canvas: HTMLCanvasElement, fileName: string): void {
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    triggerDownload(blob, fileName);
  }, "image/png");
}

export async function downloadPngFromSvg(svgElement: SVGSVGElement, fileName: string): Promise<void> {
  const source = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const image = new Image();
  image.src = url;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load SVG into image"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.width * 2;
  canvas.height = image.height * 2;

  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(url);
    return;
  }

  context.scale(2, 2);
  context.drawImage(image, 0, 0);
  URL.revokeObjectURL(url);

  downloadPngFromCanvas(canvas, fileName);
}
