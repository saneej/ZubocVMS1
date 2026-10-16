/**
 * Utility to draw a high-contrast, professional Order ID & timestamp watermark onto photos.
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

      // 1. Draw original photo
      ctx.drawImage(img, 0, 0);

      const width = img.width;
      const height = img.height;
      const baseDim = Math.max(width, height);

      // 2. Responsive font dimensions & paddings
      const orderFontSize = Math.max(18, Math.round(baseDim * 0.038));
      const subFontSize = Math.max(12, Math.round(baseDim * 0.022));
      const paddingX = Math.round(baseDim * 0.025);
      const paddingY = Math.round(baseDim * 0.018);
      const margin = Math.round(baseDim * 0.02);

      const now = new Date();
      const istDate = now.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' IST';

      const cleanOrderId = (orderId || 'PACKING-ORDER').trim().replace(/[\u2010-\u2015\u2212]/g, '-');
      const line1 = `ORDER ID: ${cleanOrderId}`;
      const line2 = `${istDate}${extraText ? ' | ' + extraText : ''}`;
      const line3 = `PACKVISION VMS • VERIFIED EVIDENCE`;

      ctx.font = `bold ${orderFontSize}px "Courier New", monospace, sans-serif`;
      const w1 = ctx.measureText(line1).width;

      ctx.font = `600 ${subFontSize}px sans-serif`;
      const w2 = ctx.measureText(line2).width;

      ctx.font = `bold ${Math.round(subFontSize * 0.85)}px sans-serif`;
      const w3 = ctx.measureText(line3).width;

      const boxWidth = Math.max(w1, w2, w3) + paddingX * 2;
      const boxHeight = orderFontSize + subFontSize * 2 + paddingY * 2 + 14;

      // Position in Bottom-Right Corner
      const x = width - boxWidth - margin;
      const y = height - boxHeight - margin;

      ctx.save();

      // Translucent Dark Background Box
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, boxWidth, boxHeight, 10);
      } else {
        ctx.rect(x, y, boxWidth, boxHeight);
      }
      ctx.fill();

      // Top Accent Line (Maroon / Pink Highlight)
      ctx.fillStyle = '#832f5e';
      ctx.beginPath();
      const accentHeight = Math.max(4, Math.round(baseDim * 0.005));
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, boxWidth, accentHeight, [10, 10, 0, 0]);
      } else {
        ctx.rect(x, y, boxWidth, accentHeight);
      }
      ctx.fill();

      // Text Formatting
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // Line 1: ORDER ID (Bright Yellow Monospace)
      ctx.font = `bold ${orderFontSize}px "Courier New", monospace, sans-serif`;
      ctx.fillStyle = '#fde047';
      ctx.fillText(line1, x + paddingX, y + paddingY + 2);

      // Line 2: Timestamp & Details (White)
      ctx.font = `600 ${subFontSize}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line2, x + paddingX, y + paddingY + orderFontSize + 6);

      // Line 3: System Verification Badge (Emerald Green)
      ctx.font = `bold ${Math.round(subFontSize * 0.85)}px sans-serif`;
      ctx.fillStyle = '#34d399';
      ctx.fillText(line3, x + paddingX, y + paddingY + orderFontSize + subFontSize + 10);

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
