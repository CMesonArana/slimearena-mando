// What the loader accepts as an invitation (no DOM here, so node tests can load it).
//
// The loader lives at a fixed HTTPS address (GitHub Pages), so iOS can keep it on
// the home screen as a full-screen app; the game's room changes address every
// launch (a quick Cloudflare tunnel). The game's QR therefore points here and
// names the room in its fragment, which never reaches a server or a log:
//   <loader>#p=<page host>.trycloudflare.com&k=<64 hex invitation>
// A QR straight to the room (https://<host>.trycloudflare.com/#<64 hex>, as the
// game makes it without a loader) is accepted too. Nothing else is: the loader
// only ever frames a room of the game's own tunnels, never a page a QR names.

const TOKEN = /^[a-f0-9]{64}$/;
/** A quick tunnel's host: labels of letters, digits and dashes under trycloudflare.com. */
const ROOM_HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;

/** The loader's own address: origin and path, without index.html, query or fragment. */
export const loaderBase = (url) => url.origin + url.pathname.replace(/index\.html$/, '');

/** The room to open, { page: 'https://host', token }, or null. */
function room(host, token) {
  host = (host ?? '').toLowerCase();
  return ROOM_HOST.test(host) && TOKEN.test(token ?? '') ? { page: `https://${host}`, token } : null;
}

/** The invitation in the loader's own fragment (`#p=…&k=…`), or null. */
export function fromFragment(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return room(params.get('p'), params.get('k'));
}

/** The invitation a scanned QR carries, or null. `text` is untrusted: it is only
 *  read, never navigated to. `here` is the loader's own URL. */
export function fromScan(text, here) {
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.username || url.password) return null;
  if (loaderBase(url) === loaderBase(new URL(here))) return fromFragment(url.hash);
  // Straight to the room: HTTPS, its page served at the root, the token after `#`.
  if (url.protocol !== 'https:' || url.port || (url.pathname !== '/' && url.pathname !== '')) return null;
  return room(url.hostname, url.hash.slice(1));
}

/** Where the frame goes: the room's page with the invitation after `#`. */
export const frameUrl = (invitation) => `${invitation.page}/#${invitation.token}`;
