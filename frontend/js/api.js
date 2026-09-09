// Thin fetch wrapper used by every page. Keeps auth token handling and
// error formatting in one place.

const AUTH_TOKEN_KEY = 'groove_auth_token';
const AUTH_USER_KEY = 'groove_auth_user';

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
function setAuthSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}
function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

// Without this, a hung/slow backend response (a cold-start free-tier
// server, a dropped connection, etc.) left fetch()'s returned promise
// unsettled forever — the calling page's "Loading…" placeholder never
// resolved into either real content or a visible error. 20s is generous
// enough for a legitimate cold start while still eventually surfacing a
// clear, actionable error instead of an infinite spinner.
const API_TIMEOUT_MS = 20000;

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The server is taking too long to respond. Please check your connection and try again.');
    }
    throw new Error('Could not reach the server. Please check your connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body (e.g. some errors) — leave data null
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

// Opens an order's invoice PDF in a new tab, attaching the caller's auth
// token as a real Authorization header. A plain `<a href>` can't do that —
// browser navigation never carries fetch()'s headers — and the invoice
// route now requires it for any order placed while logged in (Admin Phase
// 4 closed a gap where the PDF was reachable by anyone with the URL; guest
// orders with no linked account still work with no token, same as before).
async function openInvoicePdf(orderId) {
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, { headers });
  } catch {
    alert('Could not reach the server. Please check your connection and try again.');
    return;
  }
  if (!res.ok) {
    let message = `Could not open the invoice (${res.status}).`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch {
      // no JSON body — keep the generic message
    }
    alert(message);
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener');
  // Give the new tab time to actually load the blob before releasing it —
  // revoking immediately can race that load.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

// paise (integer) -> "₹425.00" style string
function formatRupees(paise) {
  if (paise === null || paise === undefined) return '';
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
