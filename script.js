// Global variables
let currentSprites = [];
let currentImageFile = null;

// DOM elements
const uploadSection      = document.getElementById('uploadSection');
const fileInput          = document.getElementById('spriteSheet');
const chooseFileBtn      = document.getElementById('chooseFileBtn');
const sliceBtn           = document.getElementById('sliceBtn');
const downloadZipBtn     = document.getElementById('downloadZipBtn');
const downloadBmpZipBtn  = document.getElementById('downloadBmpZipBtn');

const previewSection     = document.getElementById('previewSection');
const previewImage       = document.getElementById('previewImage');
const spritesSection     = document.getElementById('spritesSection');
const spritesGrid        = document.getElementById('spritesGrid');
const progressBar        = document.getElementById('progressBar');
const progressFill       = document.getElementById('progressFill');
const statusMessage      = document.getElementById('statusMessage');

function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = 'block';
}

function updateProgress(percent) {
  progressFill.style.width = percent + '%';
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

uploadSection.addEventListener('dragover', e => {
  e.preventDefault();
  uploadSection.classList.add('dragover');
});
uploadSection.addEventListener('dragleave', () => {
  uploadSection.classList.remove('dragover');
});
uploadSection.addEventListener('drop', e => {
  e.preventDefault();
  uploadSection.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
});

chooseFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
  if (!file.type.startsWith('image/')) {
    showStatus('Please select an image file', 'error');
    return;
  }
  currentImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    previewImage.src = e.target.result;
    previewSection.classList.remove('hidden');
    sliceBtn.disabled = false;
    showStatus(`Loaded: ${file.name}`, 'success');
  };
  reader.readAsDataURL(file);
}

async function sliceSpriteSheet(imageFile, spriteWidth, spriteHeight, startX, startY, gapX, gapY, rows, cols) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx    = canvas.getContext('2d');
      const sprites = [];
      const total   = 24;
      let processed = 0;

      const stepX = spriteWidth + gapX;
      const stepY = spriteHeight + gapY;

      function checkDone() {
        if (sprites.length === total) {
          updateProgress(100);
          resolve(sprites);
        }
      }

      let index = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (row === 3 && col === 5) break;
          const x = startX + col * stepX;
          const y = startY + row * stepY;
          const w = (row === 3 && col === 4) ? 49 : spriteWidth;
          const h = (row === 3 && col === 4) ? 74 : spriteHeight;
          canvas.width = w;
          canvas.height = h;

          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

          ((i) => {
            canvas.toBlob(blob => {
              sprites.push({
                filename: `sprite_${String(i).padStart(2, '0')}.png`,
                blob, position: { x, y }, size: { width: w, height: h }
              });
              processed++;
              updateProgress((processed/total)*100);
              checkDone();
            }, 'image/png');
          })(index);

          index++;
        }
      }

      // extra frame
      canvas.width = 44;
      canvas.height = 39;
      ctx.clearRect(0, 0, 44, 39);
      ctx.drawImage(img, 141, 311, 44, 39, 0, 0, 44, 39);
      canvas.toBlob(blob => {
        sprites.push({
          filename: 'sprite_23_additional.png',
          blob, position: { x: 141, y: 311 }, size: { width: 44, height: 39 }
        });
        processed++;
        updateProgress((processed/total)*100);
        checkDone();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Image load failed'));
    const reader = new FileReader();
    reader.onload = e => img.src = e.target.result;
    reader.readAsDataURL(imageFile);
  });
}

function displaySprites(sprites) {
  spritesGrid.innerHTML = '';
  sprites.forEach(s => {
    const div = document.createElement('div');
    div.className = 'sprite-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(s.blob);
    img.alt = s.filename;
    const name = document.createElement('div');
    name.className = 'filename';
    name.textContent = s.filename;
    const btn = document.createElement('button');
    btn.className = 'download-btn';
    btn.textContent = 'DL';
    btn.onclick = () => downloadSprite(s);
    div.append(img, name, btn);
    spritesGrid.appendChild(div);
  });
  spritesSection.classList.remove('hidden');
}

// Convert canvas to 24-bit BMP with RGB888 format
// Endless Online treats pure black (0,0,0) as fully transparent
function canvasToBmp24(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data    = imgData.data;

  const rowSize = Math.ceil((width * 3) / 4) * 4; // 4-byte aligned rows
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buffer   = new ArrayBuffer(fileSize);
  const view     = new DataView(buffer);

  // BMP file header (14 bytes)
  view.setUint16(0, 0x4D42, true);         // signature
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);            // pixel offset

  // DIB header (40 bytes)
  view.setUint32(14, 40, true);            // header size
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);        // negative = top-down
  view.setUint16(26, 1, true);             // planes
  view.setUint16(28, 24, true);            // bits per pixel
  view.setUint32(34, pixelArraySize, true);

  let offset = 54;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];

      // EO transparency: alpha=0 becomes black, everything else preserves color
      if (a === 0) {
        r = g = b = 0;
      }

      // BGR order for BMP
      view.setUint8(offset++, b);
      view.setUint8(offset++, g);
      view.setUint8(offset++, r);
    }
    // row padding to 4-byte boundary
    for (let p = 0; p < rowSize - width * 3; p++) {
      view.setUint8(offset++, 0);
    }
  }

  return new Uint8Array(buffer);
}

function downloadSprite(sprite) {
  const url = URL.createObjectURL(sprite.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sprite.filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadSpritesAsZip(sprites) {
  const zip = new JSZip();
  sprites.forEach(s => zip.file(s.filename, s.blob));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'sprites.zip';
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadSpritesAsBmpZip(sprites) {
  const zip = new JSZip();
  showStatus('Converting to 24‑bit BMP…', 'info');

  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i];
    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c  = document.createElement('canvas');
        const cx = c.getContext('2d');
        c.width  = img.width;
        c.height = img.height;
        cx.drawImage(img, 0, 0);
        const bmp = canvasToBmp24(c);
        zip.file(s.filename.replace('.png', '.bmp'), bmp);
        updateProgress(((i+1)/sprites.length)*100);
        res();
      };
      img.onerror = rej;
      img.src = URL.createObjectURL(s.blob);
    });
  }

  progressBar.classList.remove('hidden');
  const blob = await zip.generateAsync({ type: 'blob' });
  progressBar.classList.add('hidden');
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'sprites_24bit_pure_black.zip';
  a.click();
  URL.revokeObjectURL(url);
  showStatus('BMP download complete!', 'success');
}

sliceBtn.addEventListener('click', async () => {
  if (!currentImageFile) {
    showStatus('No image selected', 'error');
    return;
  }
  const spriteWidth  = parseInt(getInputValue('spriteWidth'));
  const spriteHeight = parseInt(getInputValue('spriteHeight'));
  const startX       = parseInt(getInputValue('startX'));
  const startY       = parseInt(getInputValue('startY'));
  const gapX         = parseInt(getInputValue('gapX'));
  const gapY         = parseInt(getInputValue('gapY'));
  const rows         = parseInt(getInputValue('rows'));
  const cols         = parseInt(getInputValue('cols'));

  progressBar.classList.remove('hidden');
  sliceBtn.disabled = true;
  try {
    currentSprites = await sliceSpriteSheet(
      currentImageFile,
      spriteWidth, spriteHeight,
      startX, startY,
      gapX, gapY,
      rows, cols
    );
    displaySprites(currentSprites);
    downloadZipBtn.disabled    = false;
    downloadBmpZipBtn.disabled = false;
    showStatus(`Extracted ${currentSprites.length} sprites!`, 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    sliceBtn.disabled = false;
    progressBar.classList.add('hidden');
  }
});

downloadZipBtn.addEventListener('click', () => {
  if (currentSprites.length) downloadSpritesAsZip(currentSprites);
});
downloadBmpZipBtn.addEventListener('click', () => {
  if (currentSprites.length) downloadSpritesAsBmpZip(currentSprites);
});

showStatus('Ready to slice sprites!', 'info');