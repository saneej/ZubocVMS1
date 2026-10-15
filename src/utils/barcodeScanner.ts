import {
  MultiFormatReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat
} from '@zxing/library';
import jsQR from 'jsqr';

// Configure persistent ZXing reader with all relevant shipping & logistics barcode formats
const zxingReader = new MultiFormatReader();
const zxingHints = new Map<DecodeHintType, any>();
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX
]);
zxingHints.set(DecodeHintType.TRY_HARDER, true);
zxingReader.setHints(zxingHints);

// Inverted reader for thermal prints and high-contrast dark-mode barcodes
const zxingInvertedReader = new MultiFormatReader();
zxingInvertedReader.setHints(zxingHints);

// Cached native BarcodeDetector instance
let nativeDetectorInstance: any = null;
let nativeDetectorInitialized = false;

async function getNativeBarcodeDetector() {
  if (nativeDetectorInitialized) return nativeDetectorInstance;
  nativeDetectorInitialized = true;

  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const DetectorClass = (window as any).BarcodeDetector;
      const targetFormats = [
        'code_128',
        'code_39',
        'code_93',
        'ean_13',
        'ean_8',
        'upc_a',
        'upc_e',
        'itf',
        'qr_code',
        'data_matrix'
      ];

      let supportedFormats: string[] = [];
      if (typeof DetectorClass.getSupportedFormats === 'function') {
        try {
          supportedFormats = await DetectorClass.getSupportedFormats();
        } catch {
          supportedFormats = [];
        }
      }

      const activeFormats = supportedFormats.length > 0
        ? targetFormats.filter(f => supportedFormats.includes(f))
        : targetFormats;

      nativeDetectorInstance = new DetectorClass({ formats: activeFormats });
      return nativeDetectorInstance;
    } catch (err) {
      console.warn('Native BarcodeDetector initialization skipped:', err);
      nativeDetectorInstance = null;
    }
  }
  return null;
}

// Convert RGBA imageData into a 1-byte-per-pixel grayscale luminance buffer
function createGrayscaleBuffer(data: Uint8ClampedArray, length: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(length);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Standard NTSC/ITU perceptual luminance: 0.299R + 0.587G + 0.114B
    gray[j] = ((data[i] * 77) + (data[i + 1] * 150) + (data[i + 2] * 29)) >> 8;
  }
  return gray;
}

// Contrast-stretched grayscale buffer for faint or low-contrast thermal shipping labels
function createHighContrastGrayscaleBuffer(data: Uint8ClampedArray, length: number): Uint8ClampedArray {
  const gray = createGrayscaleBuffer(data, length);
  let min = 255;
  let max = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < min) min = gray[i];
    if (gray[i] > max) max = gray[i];
  }
  const range = max - min;
  if (range > 15 && range < 220) {
    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.min(255, Math.max(0, Math.floor(((gray[i] - min) * 255) / range)));
    }
  }
  return gray;
}

// Decode using ZXing from grayscale luminance array
function decodeWithZxingGrayscale(grayBuffer: Uint8ClampedArray, width: number, height: number): string | null {
  try {
    const lumSource = new RGBLuminanceSource(grayBuffer, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(lumSource));
    const result = zxingReader.decodeWithState(bitmap);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Normal when no barcode in frame
  }

  // Try inverted bitmap (useful for inverted barcodes or dark background labels)
  try {
    const lumSource = new RGBLuminanceSource(grayBuffer, width, height);
    const invertedSource = lumSource.invert();
    const invertedBitmap = new BinaryBitmap(new HybridBinarizer(invertedSource));
    const result = zxingInvertedReader.decodeWithState(invertedBitmap);
    if (result && result.getText()) {
      return result.getText();
    }
  } catch {
    // Normal
  }

  return null;
}

// Reusable canvas elements for offscreen frame analysis
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCenterCanvas: HTMLCanvasElement | null = null;

function getSharedCanvas(w: number, h: number) {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
  }
  if (sharedCanvas.width !== w || sharedCanvas.height !== h) {
    sharedCanvas.width = w;
    sharedCanvas.height = h;
  }
  return sharedCanvas;
}

function getSharedCenterCanvas(w: number, h: number) {
  if (!sharedCenterCanvas) {
    sharedCenterCanvas = document.createElement('canvas');
  }
  if (sharedCenterCanvas.width !== w || sharedCenterCanvas.height !== h) {
    sharedCenterCanvas.width = w;
    sharedCenterCanvas.height = h;
  }
  return sharedCenterCanvas;
}

export interface BarcodeScanResult {
  code: string;
  engine: 'native' | 'zxing' | 'jsqr' | 'zxing-contrast';
  format?: string;
}

/**
 * High-performance real-time barcode reader for live video streams
 * Employs a multi-tier scanning pipeline:
 *  1. Native BarcodeDetector (GPU accelerated, ultra fast)
 *  2. Center Reticle Crop (Focuses on the green target zone for 1D AWB tracking barcodes)
 *  3. ZXing MultiFormat Engine (Code 128, Code 39, EAN-13, ITF, etc.)
 *  4. jsQR Engine (Fast 2D QR detector)
 *  5. Adaptive Contrast Filter (For faint thermal AWB receipts)
 */
export async function scanBarcodeFromVideo(video: HTMLVideoElement): Promise<BarcodeScanResult | null> {
  if (!video || video.readyState < 2) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || vw < 10 || vh < 10) return null;

  // 1. First Tier: Native Hardware Accelerated BarcodeDetector on full video
  try {
    const detector = await getNativeBarcodeDetector();
    if (detector) {
      const barcodes = await detector.detect(video);
      if (barcodes && barcodes.length > 0) {
        for (const b of barcodes) {
          if (b.rawValue && b.rawValue.trim()) {
            return {
              code: b.rawValue.trim(),
              engine: 'native',
              format: b.format
            };
          }
        }
      }
    }
  } catch {
    // Continue to next tier
  }

  // 2. Second Tier: Process Center Reticle Crop (where operator holds barcode)
  // Overhead cameras are often 1920x1080; cropping to center 60% x 60% drastically
  // increases 1D barcode bar-width resolution and eliminates background table noise
  const cropW = Math.floor(vw * 0.70);
  const cropH = Math.floor(vh * 0.60);
  const cropX = Math.floor((vw - cropW) / 2);
  const cropY = Math.floor((vh - cropH) / 2);

  const centerCanvas = getSharedCenterCanvas(cropW, cropH);
  const centerCtx = centerCanvas.getContext('2d', { willReadFrequently: true });
  if (centerCtx) {
    centerCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Native BarcodeDetector on center crop
    try {
      const detector = await getNativeBarcodeDetector();
      if (detector) {
        const barcodes = await detector.detect(centerCanvas);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          return {
            code: barcodes[0].rawValue.trim(),
            engine: 'native',
            format: barcodes[0].format
          };
        }
      }
    } catch {
      // Continue
    }

    const centerImageData = centerCtx.getImageData(0, 0, cropW, cropH);

    // Fast jsQR check on center crop
    try {
      const qrRes = jsQR(centerImageData.data, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      if (qrRes && qrRes.data && qrRes.data.trim()) {
        return {
          code: qrRes.data.trim(),
          engine: 'jsqr',
          format: 'QR_CODE'
        };
      }
    } catch {
      // Continue
    }

    // ZXing check on center crop with perceptual grayscale
    const centerGray = createGrayscaleBuffer(centerImageData.data, cropW * cropH);
    const zxingCenterCode = decodeWithZxingGrayscale(centerGray, cropW, cropH);
    if (zxingCenterCode && zxingCenterCode.trim()) {
      return {
        code: zxingCenterCode.trim(),
        engine: 'zxing'
      };
    }

    // High contrast pass on center crop for faint thermal labels
    const centerContrastGray = createHighContrastGrayscaleBuffer(centerImageData.data, cropW * cropH);
    const zxingContrastCode = decodeWithZxingGrayscale(centerContrastGray, cropW, cropH);
    if (zxingContrastCode && zxingContrastCode.trim()) {
      return {
        code: zxingContrastCode.trim(),
        engine: 'zxing-contrast'
      };
    }
  }

  // 3. Third Tier: Full Frame ZXing & jsQR (if barcode held off-center)
  // Scale down 1080p full frame slightly if very large to prevent UI lag
  const targetW = vw > 1280 ? Math.floor(vw / 2) : vw;
  const targetH = vh > 720 ? Math.floor(vh / 2) : vh;

  const canvas = getSharedCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const fullImageData = ctx.getImageData(0, 0, targetW, targetH);

    // jsQR on full frame
    try {
      const fullQr = jsQR(fullImageData.data, targetW, targetH, { inversionAttempts: 'dontInvert' });
      if (fullQr && fullQr.data && fullQr.data.trim()) {
        return {
          code: fullQr.data.trim(),
          engine: 'jsqr',
          format: 'QR_CODE'
        };
      }
    } catch {
      // Continue
    }

    // ZXing on full frame
    const fullGray = createGrayscaleBuffer(fullImageData.data, targetW * targetH);
    const fullZxingCode = decodeWithZxingGrayscale(fullGray, targetW, targetH);
    if (fullZxingCode && fullZxingCode.trim()) {
      return {
        code: fullZxingCode.trim(),
        engine: 'zxing'
      };
    }
  }

  return null;
}

/**
 * Scan barcode from an uploaded image file (PNG, JPG, WEBP)
 */
export async function scanBarcodeFromImageFile(file: File): Promise<BarcodeScanResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);

      // 1. Try Native BarcodeDetector
      try {
        const detector = await getNativeBarcodeDetector();
        if (detector) {
          const barcodes = await detector.detect(canvas);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            resolve({
              code: barcodes[0].rawValue.trim(),
              engine: 'native',
              format: barcodes[0].format
            });
            return;
          }
        }
      } catch {
        // Continue
      }

      const imageData = ctx.getImageData(0, 0, w, h);

      // 2. Try jsQR
      try {
        const qrRes = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (qrRes && qrRes.data && qrRes.data.trim()) {
          resolve({
            code: qrRes.data.trim(),
            engine: 'jsqr',
            format: 'QR_CODE'
          });
          return;
        }
      } catch {
        // Continue
      }

      // 3. Try ZXing with standard grayscale
      const gray = createGrayscaleBuffer(imageData.data, w * h);
      const zxingCode = decodeWithZxingGrayscale(gray, w, h);
      if (zxingCode && zxingCode.trim()) {
        resolve({
          code: zxingCode.trim(),
          engine: 'zxing'
        });
        return;
      }

      // 4. Try ZXing with contrast stretching
      const contrastGray = createHighContrastGrayscaleBuffer(imageData.data, w * h);
      const contrastCode = decodeWithZxingGrayscale(contrastGray, w, h);
      if (contrastCode && contrastCode.trim()) {
        resolve({
          code: contrastCode.trim(),
          engine: 'zxing-contrast'
        });
        return;
      }

      resolve(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}
