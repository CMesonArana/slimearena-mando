// The phone's loader for playing online (GyroClash's web-controller/src/loader.ts,
// trimmed: here the room serves the whole page itself, so the loader only frames it).
//
// Saved to the iPhone's home screen it opens as its own app, with no Safari bars:
// with no invitation it opens the camera and reads the game's QR, then shows the
// room's page full screen in a frame. A room on another address cannot be opened
// any other way without leaving that app for a Safari sheet. Opened from a QR in
// Safari it frames the room at once, and "Añadir a pantalla de inicio" keeps this
// page, never the invitation: the fragment is gone from the address bar first.
//
// What a QR says is untrusted: invite.js accepts only a room of the game's own
// tunnels, and the loader never navigates to it, logs it or stores it.
import { fromFragment, fromScan, frameUrl } from './invite.js';

const TEXT = {
  idle: 'Escanea el QR de la pantalla del juego para unirte.',
  aim: 'Apunta la cámara al QR de la pantalla del juego.',
  foreign: 'Ese QR no es de una partida online. Si es de la wifi, ábrelo con la cámara del móvil.',
  camera: 'No se puede usar la cámara aquí. Abre el QR con la cámara del móvil.',
  scan: 'Escanear QR',
  cancel: 'Cancelar',
};
/** States of the room's page (connection.js) after which it will not come back by itself: "Escanear otro QR" at once. */
const ENDED = new Set(['invalid_invitation', 'full', 'closed', 'removed', 'version_mismatch', 'unreachable']);
/** How long the room's page may go without being ready (or, at first, without a word) before "Escanear otro QR" shows.
 *  A game closed without a word leaves the page retrying for ever, and a tunnel that is gone serves Cloudflare's error
 *  page instead of it: a home-screen app could not leave either. A phone waking from sleep is back well before. */
const LOST_MS = 10_000;

const $ = id => document.getElementById(id);
const screen = $('scan-screen'), status = $('status'), scanButton = $('scan'), video = $('video');
const frame = $('room'), again = $('again');

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
$('install').hidden = !ios || standalone;

let roomOrigin = '';
/** The timer that offers the next QR while the room is not ready; 0 when none runs. */
let lost = 0;
function stopLost() { clearTimeout(lost); lost = 0; }
function startLost() { if (!lost) lost = setTimeout(() => { lost = 0; again.hidden = false; }, LOST_MS); }

function open(invitation) {
  stopScan();
  roomOrigin = invitation.page;
  screen.hidden = true;
  again.hidden = true;
  frame.hidden = false;
  frame.src = frameUrl(invitation);
  stopLost();
  startLost();
}

function leave() {
  stopLost();
  roomOrigin = '';
  frame.src = 'about:blank';
  frame.hidden = true;
  again.hidden = true;
  screen.hidden = false;
  status.textContent = TEXT.idle;
}

// The room's page tells its connection state (companion/web/js/main.js): once it has ended, the next QR is one tap away.
addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== roomOrigin) return;
  const data = event.data;
  if (!data || data.type !== 'slime-arena' || typeof data.state !== 'string') return;
  if (data.state === 'ready') { stopLost(); again.hidden = true; }
  else if (ENDED.has(data.state)) { stopLost(); again.hidden = false; }
  else startLost(); // connecting, resuming, offline: the timer that runs already keeps running
});

let scanner = null;
/** Goes up on every stop: an import or a start() that finishes later is no longer the current one. */
let generation = 0;
let scanning = false;

function stopScan() {
  generation++;
  scanning = false;
  scanner?.destroy(); // stops the camera and the worker
  scanner = null;
  video.hidden = true;
  scanButton.textContent = TEXT.scan;
}

function onResult(text) {
  const invitation = fromScan(text, location.href);
  if (!invitation) { status.textContent = TEXT.foreign; return; } // keeps scanning
  open(invitation);
}

/** `auto`: opened by itself on launch; if the camera wants a tap first, the button stays. */
async function scan(auto) {
  if (scanning) return;
  scanning = true;
  const mine = ++generation;
  video.hidden = false; // before the scanner: with the video hidden it hides it its own way
  status.textContent = TEXT.aim;
  scanButton.textContent = TEXT.cancel;
  try {
    const { default: QrScanner } = await import('./vendor/qr-scanner.min.js');
    if (mine !== generation) return;
    const created = new QrScanner(video, result => { if (scanner === created) onResult(result.data); },
      { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 10, onDecodeError: () => {} });
    scanner = created;
    await created.start();
  } catch {
    if (mine !== generation) return; // already cancelled
    stopScan();
    status.textContent = auto ? TEXT.idle : TEXT.camera;
  }
}

scanButton.addEventListener('click', () => { if (scanning) { stopScan(); status.textContent = TEXT.idle; } else void scan(false); });
again.addEventListener('click', () => { leave(); void scan(false); });

const hadFragment = location.hash.length > 1;
const invitation = hadFragment ? fromFragment(location.hash) : null;
// The fragment leaves the address bar before anything else: a screenshot, the history or the home screen never keep it.
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
if (invitation) open(invitation);
else if (hadFragment) status.textContent = TEXT.foreign;
else if (standalone) void scan(true); // the app was opened to scan
