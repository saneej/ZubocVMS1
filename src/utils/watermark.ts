/**
 * Draws an ultra-minimal single-line pill watermark onto photos.
 */
export async function watermarkPhoto(
  source: Blob | File | string,
  orderId: string,
  extraText?: string
): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl = '';
    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      const width = img.width;
      const height = img.height;
      const baseDim = Math.max(width, height);

      // Micro typography dimensions
      const fontSize = Math.max(11, Math.round(baseDim * 0.015));
      const paddingX = Math.round(fontSize * 0.85);
      const paddingY = Math.round(fontSize * 0.4);
      const margin = Math.round(baseDim * 0.015);

      const now = new Date();
      const dateStr = now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      const cleanOrderId = (orderId || 'PACKING').trim().replace(/[\u2010-\u2015\u2212]/g, '-');
      const watermarkText = `#${cleanOrderId} • ${dateStr}${extraText ? ' • ' + extraText : ''}`;

      ctx.save();
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const textWidth = ctx.measureText(watermarkText).width;

      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = fontSize + paddingY * 2;
      const borderRadius = boxHeight / 2; // Perfect pill capsule

      const x = width - boxWidth - margin;
      const y = height - boxHeight - margin;

      // Translucent dark pill shape
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, boxWidth, boxHeight, borderRadius);
      } else {
        ctx.rect(x, y, boxWidth, boxHeight);
      }
      ctx.fill();

      // Clean single-line text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText(watermarkText, x + paddingX, y + boxHeight / 2);

      ctx.restore();

      // Output as JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ dataUrl, blob });
          } else {
            const byteString = atob(dataUrl.split(',')[1]);
            const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            resolve({ dataUrl, blob: new Blob([ab], { type: mimeString }) });
          }
        },
        'image/jpeg',
        0.95
      );
    };

    img.onerror = (err) => reject(err);
  });
}
