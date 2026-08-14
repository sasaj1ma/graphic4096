import './style.css';
import { createRuntime, WIDTH, HEIGHT } from './runtime.js';

const sketchModules = import.meta.glob('../sketches/*.js');

const canvas = document.querySelector('#matrix');
const context = canvas.getContext('2d');
const { api, pixels } = createRuntime();
const status = document.querySelector('#status');
const statusDot = document.querySelector('#status-dot');
const fpsLabel = document.querySelector('#fps');
const sketchSelect = document.querySelector('#sketch-select');
const sketchName = document.querySelector('#sketch-name');
let running = true;
let frames = 0;
let lastFpsUpdate = performance.now();
let draw = () => {};

function nameFromPath(path) {
  return path.split('/').pop().replace(/\.js$/, '').replaceAll('-', ' ');
}

async function loadSketch(path) {
  try {
    const module = await sketchModules[path]();
    if (typeof module.draw !== 'function') throw new Error('`draw(api)` が見つかりません');
    draw = module.draw;
    api.resetTime();
    api.randomSeed(1);
    sketchName.textContent = path.replace('../', '');
    status.textContent = 'Running';
    statusDot.classList.remove('paused', 'error');
  } catch (error) {
    running = false;
    status.textContent = `Sketch error: ${error.message}`;
    statusDot.classList.add('error');
    console.error(error);
  }
}

const sketchPaths = Object.keys(sketchModules).sort();
for (const path of sketchPaths) {
  const option = document.createElement('option');
  option.value = path;
  option.textContent = nameFromPath(path);
  sketchSelect.append(option);
}

sketchSelect.addEventListener('change', () => {
  running = true;
  loadSketch(sketchSelect.value);
});

if (sketchPaths.length > 0) loadSketch(sketchPaths[0]);

function render() {
  const pitch = canvas.width / WIDTH;
  const radius = pitch * 0.34;
  const ledBase = '#08090d';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#020304';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 3;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const brightness = Math.max(r, g, b) / 255;
      const centerX = x * pitch + pitch / 2;
      const centerY = y * pitch + pitch / 2;

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fillStyle = brightness > 0 ? `rgb(${r}, ${g}, ${b})` : ledBase;
      context.fill();

      if (brightness > 0.12) {
        context.beginPath();
        context.arc(centerX, centerY, radius * 0.42, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${brightness * 0.18})`;
        context.fill();
      }
    }
  }
}

function frame(now) {
  if (running) {
    try {
      draw(api);
      render();
      status.textContent = 'Running';
      statusDot.classList.remove('paused', 'error');
    } catch (error) {
      running = false;
      status.textContent = `Sketch error: ${error.message}`;
      statusDot.classList.add('error');
      console.error(error);
    }
    frames += 1;
  }
  if (now - lastFpsUpdate > 500) {
    fpsLabel.textContent = `${Math.round(frames * 1000 / (now - lastFpsUpdate))} fps`;
    frames = 0;
    lastFpsUpdate = now;
  }
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.target.matches('input, textarea')) return;
  event.preventDefault();
  running = !running;
  status.textContent = running ? 'Running' : 'Paused';
  statusDot.classList.toggle('paused', !running);
});

requestAnimationFrame(frame);
