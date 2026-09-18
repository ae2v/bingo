import { describe, expect, it, vi } from 'vitest';
import { decodeQrFrame } from './qrScanner';

describe('decodeQrFrame', () => {
  it('utilise le decodeur JavaScript quand BarcodeDetector est absent', async () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };
    const fallback = vi.fn(() => ({ data: 'Camille;k7m4' }));

    const result = await decodeQrFrame({
      source: {} as CanvasImageSource,
      width: 4,
      height: 4,
      canvas: canvas as unknown as HTMLCanvasElement,
      detector: null,
      fallback,
    });

    expect(result).toBe('Camille;k7m4');
    expect(fallback).toHaveBeenCalledWith(pixels, 4, 4, { inversionAttempts: 'attemptBoth' });
  });
});
