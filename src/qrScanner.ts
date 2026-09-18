import jsQR, { type Options, type QRCode } from 'jsqr';

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type FallbackDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: Options,
) => Pick<QRCode, 'data'> | null;

type DecodeQrFrameOptions = {
  source: CanvasImageSource;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  detector?: BarcodeDetectorLike | null;
  fallback?: FallbackDecoder;
};

export async function decodeQrFrame({
  source,
  width,
  height,
  canvas,
  detector = null,
  fallback = jsQR,
}: DecodeQrFrameOptions): Promise<string | null> {
  if (detector) {
    try {
      const detected = await detector.detect(source);
      if (detected[0]?.rawValue) return detected[0].rawValue;
    } catch {
      // Some mobile implementations expose BarcodeDetector but reject video frames.
      // The pixel decoder below remains the reliable cross-browser path.
    }
  }

  if (width <= 0 || height <= 0) return null;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  return fallback(pixels, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}
