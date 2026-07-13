const PNG = require('pngjs').PNG;
const fs = require('fs');

console.log('Generating 256x256 application icon...');

const WIDTH = 256;
const HEIGHT = 256;
const png = new PNG({ width: WIDTH, height: HEIGHT, colorType: 6 });

// Colors
const COLORS = {
  bg: [15, 23, 42],
  screen: [30, 64, 175],
  screenLight: [59, 130, 246],
  border: [100, 120, 160],
  base: [20, 40, 100],
  keyboard: [50, 80, 180],
  keyHighlight: [80, 110, 210],
  trackpad: [40, 60, 120],
  hinge: [40, 55, 110],
  white: [255, 255, 255]
};

function drawLaptop(png) {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      const cx = x - WIDTH / 2;
      const cy = y - HEIGHT / 2;

      let r = COLORS.bg[0], g = COLORS.bg[1], b = COLORS.bg[2];

      // Screen dimensions
      const sW = 140, sH = 100, sTop = -65;

      // Base dimensions
      const bW = 160, bH = 22, bTop = 35;

      // Draw screen
      if (Math.abs(cx) < sW/2 && cy > sTop && cy < sTop + sH) {
        const isBorder = Math.abs(cx) > sW/2 - 5 || 
                         Math.abs(cy - sTop) < 5 || 
                         Math.abs(cy - (sTop + sH)) < 5;
        
        if (isBorder) {
          [r, g, b] = COLORS.border;
        } else {
          // Screen gradient
          const t = (cy - sTop) / sH;
          r = Math.round(30 + t * 25);
          g = Math.round(60 + t * 50);
          b = Math.round(170 + t * 60);

          // Simulate content lines
          const contentY = cy - sTop;
          if (contentY > 28 && contentY < sH - 8) {
            const lineSpacing = 7;
            if (contentY % lineSpacing < 3) {
              const lineWidth = 30 + (contentY % 50) * 0.5;
              if (Math.abs(cx) < lineWidth) {
                [r, g, b] = COLORS.screenLight;
              }
            }
          }
          
          // Simulate a graph/bar on right side
          if (cx > 15 && cx < 50 && contentY > 30 && contentY < 80) {
            const barHeight = 40 - Math.abs(contentY - 55);
            if (barHeight > 0 && cx < 25 + barHeight * 0.4) {
              r = Math.min(r + 60, 255);
              g = Math.min(g + 100, 255);
              b = Math.min(b + 40, 255);
            }
          }

          // Apple logo
          if (Math.abs(cx) < 10 && Math.abs(cy - (sTop + 22)) < 10) {
            const dist = Math.sqrt(cx*cx + (cy - (sTop + 22))*(cy - (sTop + 22)));
            if (dist < 8) {
              [r, g, b] = COLORS.white;
            }
          }
        }
      }

      // Draw base
      if (Math.abs(cx) < bW/2 && cy > bTop && cy < bTop + bH) {
        [r, g, b] = COLORS.base;
        
        // Keyboard area
        if (cy > bTop + 5 && cy < bTop + bH - 4) {
          [r, g, b] = COLORS.keyboard;
          
          // Key pattern
          if (Math.floor(Math.abs(cx)) % 10 < 7 && 
              Math.floor(cy) % 5 < 3) {
            r = Math.min(r + 30, 255);
            g = Math.min(g + 20, 255);
            b = Math.min(b + 10, 255);
          }
        }
        
        // Trackpad
        if (Math.abs(cx) < 18 && cy > bTop + 8 && cy < bTop + bH - 5) {
          [r, g, b] = COLORS.trackpad;
        }
      }

      // Hinge area
      if (Math.abs(cx) < sW/2 + 3 && cy > sTop + sH - 3 && cy < bTop) {
        [r, g, b] = COLORS.hinge;
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
}

console.log('Drawing laptop icon...');
drawLaptop(png);

console.log('Writing PNG...');
const pngBuffer = PNG.sync.write(png);
fs.writeFileSync('src/assets/icon.png', pngBuffer);
console.log('icon.png: ' + pngBuffer.length + ' bytes');

console.log('Creating ICO...');
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(pngBuffer.length, 8);
entry.writeUInt32LE(22, 12);

const icoBuffer = Buffer.concat([header, entry, pngBuffer]);
fs.writeFileSync('src/assets/icon.ico', icoBuffer);
console.log('icon.ico: ' + icoBuffer.length + ' bytes');
console.log('Done! Icons generated successfully.');