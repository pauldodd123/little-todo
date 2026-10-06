// Minimal browser client for the VibeCodeStorage API.
// Same wire format as the official SDK: AES-256-GCM envelopes, HKDF-derived keys,
// HMAC row ids, optimistic versions via If-Match.

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function encode64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(out).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decode64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

export class StorageError extends Error {
  constructor(message, status, code) { super(message); this.name = 'StorageError'; this.status = status; this.code = code; }
}

async function deriveKeys(secret) {
  const raw = decode64(secret);
  if (raw.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const derive = (info, algorithm, usage) => crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('vibecodestorage/v1'), info: encoder.encode(info) },
    base, algorithm, false, usage);
  return {
    encryption: await derive('records', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
    lookup: await derive('lookup', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign'])
  };
}

export class Store {
  constructor({ endpoint, storeId, accessToken, encryptionKey }) {
    this.endpoint = new URL(endpoint).origin;
    this.storeId = storeId;
    this.token = accessToken;
    this.keys = deriveKeys(encryptionKey);
  }

  async request(path, { method = 'GET', body, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(`${this.endpoint}/v1/stores/${this.storeId}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      // A CORS rejection surfaces here as a bare TypeError with no status.
      throw new StorageError('Could not reach the storage API (network or CORS block).', 0, 'NETWORK');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new StorageError(data.error?.message || `HTTP ${res.status}`, res.status, data.error?.code);
    return data;
  }

  async rowId(label) {
    const keys = await this.keys;
    return encode64(new Uint8Array(await crypto.subtle.sign('HMAC', keys.lookup, encoder.encode(label))));
  }

  aad(id) { return encoder.encode(`vibecodestorage/v1/${this.storeId}/${id}`); }

  async encrypt(id, label, value) {
    const keys = await this.keys;
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plain = encoder.encode(JSON.stringify({ key: label, value }));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: this.aad(id), tagLength: 128 }, keys.encryption, plain);
    return { v: 1, alg: 'A256GCM', nonce: encode64(nonce), ciphertext: encode64(new Uint8Array(ct)) };
  }

  async decrypt(row) {
    const keys = await this.keys;
    const e = row.envelope;
    if (e.v !== 1 || e.alg !== 'A256GCM') throw new Error('Unsupported record');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(e.nonce), additionalData: this.aad(row.id), tagLength: 128 },
      keys.encryption, decode64(e.ciphertext));
    const result = JSON.parse(decoder.decode(plain));
    return { ...result, version: row.version };
  }

  // Returns { value, version }; a missing row returns { value: undefined, version: 0 }.
  async getEntry(label) {
    const id = await this.rowId(label);
    try { return await this.decrypt(await this.request(`/rows/${id}`)); }
    catch (e) { if (e.status === 404) return { key: label, value: undefined, version: 0 }; throw e; }
  }

  // Optimistic write: version must match what was last read, 0 for create.
  async set(label, value, version) {
    const id = await this.rowId(label);
    return this.request(`/rows/${id}`, { method: 'PUT', headers: { 'If-Match': `"${version}"` }, body: await this.encrypt(id, label, value) });
  }

  info() { return this.request(''); }
}
