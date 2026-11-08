const $ = (selector) => document.querySelector(selector);
const fileInput = $('#fileInput');
const dropZone = $('#dropZone');
const uploadView = $('#uploadView');
const editorView = $('#editorView');
const modal = $('#processingModal');
const progressFill = $('#progressFill');
const progressPercent = $('#progressPercent');
const progressLabel = $('#progressLabel');
const canvas = $('#resultCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let originalFile = null;

['dragenter', 'dragover'].forEach(event => dropZone.addEventListener(event, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(event => dropZone.addEventListener(event, e => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
dropZone.addEventListener('drop', (event) => handleFile(event.dataTransfer.files[0]));
fileInput.addEventListener('change', (event) => handleFile(event.target.files[0]));
document.addEventListener('paste', (event) => {
  const imageItem = [...event.clipboardData.items].find(item => item.type.startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();
  const blob = imageItem.getAsFile();
  if (blob) handleFile(new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type || 'image/png' }));
});
$('#newImage').addEventListener('click', () => { editorView.classList.add('hidden'); uploadView.classList.remove('hidden'); fileInput.value = ''; });

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > 12 * 1024 * 1024) { alert('Please choose an image smaller than 12 MB.'); return; }
  originalFile = file;
  const url = URL.createObjectURL(file);
  $('#beforeImage').src = url;
  $('#thumb').src = url;
  $('#fileName').textContent = file.name.replace(/\.[^/.]+$/, '');
  $('#fileDetails').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · ${file.type.replace('image/', '').toUpperCase()}`;
  runProcessing(url);
}

async function runProcessing(url) {
  modal.classList.remove('hidden');
  const stages = [
    [12, 'Reading image'], [29, 'Finding the subject'], [51, 'Separating background'], [76, 'Refining clean edges'], [91, 'Polishing the result']
  ];
  for (const [percent, label] of stages) {
    progressLabel.textContent = label;
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    await wait(260);
  }
  const image = await loadImage(url);
  await removeBackground(image);
  progressLabel.textContent = 'Cutout complete';
  progressFill.style.width = '100%';
  progressPercent.textContent = '100%';
  await wait(380);
  modal.classList.add('hidden');
  uploadView.classList.add('hidden'); editorView.classList.remove('hidden');
}

function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Local edge-connected color removal: great for studio, product and solid-color backgrounds.
async function removeBackground(img) {
  const max = 1800;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const total = width * height;
  const visited = new Uint8Array(total);
  const background = new Uint8Array(total);
  const corners = [[0,0],[width-1,0],[0,height-1],[width-1,height-1]];
  const samples = [];
  for (const [cx, cy] of corners) for (let y = Math.max(0,cy-8); y <= Math.min(height-1,cy+8); y++) for (let x = Math.max(0,cx-8); x <= Math.min(width-1,cx+8); x++) { const i=(y*width+x)*4; samples.push([data[i],data[i+1],data[i+2]]); }
  const base = samples.reduce((sum,v) => [sum[0]+v[0]/samples.length,sum[1]+v[1]/samples.length,sum[2]+v[2]/samples.length],[0,0,0]);
  const colorDistance = (index) => { const i=index*4; return Math.hypot(data[i]-base[0], data[i+1]-base[1], data[i+2]-base[2]); };
  const queue = new Int32Array(total); let head = 0, tail = 0;
  const enqueue = index => { if (!visited[index] && colorDistance(index) < 74) { visited[index]=1; queue[tail++]=index; } };
  for (let x=0;x<width;x++) { enqueue(x); enqueue((height-1)*width+x); }
  for (let y=1;y<height-1;y++) { enqueue(y*width); enqueue(y*width+width-1); }
  while (head < tail) { const p = queue[head++]; background[p] = 1; const x = p % width; if (x) enqueue(p-1); if (x<width-1) enqueue(p+1); if (p>=width) enqueue(p-width); if (p<total-width) enqueue(p+width); }
  for (let p=0;p<total;p++) if (background[p]) { const i=p*4; const d=colorDistance(p); data[i+3] = d < 43 ? 0 : Math.round(Math.min(1,(d-43)/31)*255); }
  ctx.putImageData(imageData, 0, 0);
}

function canvasBlob() { return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
async function withButtonSpinner(button, work) { button.classList.add('is-loading'); try { return await work(); } finally { await wait(180); button.classList.remove('is-loading'); } }
$('#downloadButton').addEventListener('click', async () => withButtonSpinner($('#downloadButton'), async () => { const blob = await canvasBlob(); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${(originalFile?.name || 'clearcut').replace(/\.[^/.]+$/, '')}-transparent.png`; a.click(); URL.revokeObjectURL(a.href); }));
$('#copyButton').addEventListener('click', async () => withButtonSpinner($('#copyButton'), async () => { try { const blob = await canvasBlob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); showToast('Copied transparent PNG'); } catch { showToast('Clipboard access unavailable'); } }));
function showToast(message) { $('#toast p').textContent = message; const toast=$('#toast'); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); }
