const enc = new TextEncoder();
const dec = new TextDecoder();

async function getKey(password) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("unique-salt-123"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

export async function encrypt(text, password) {
  const key = await getKey(password);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return {
    msg: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

export async function decrypt(data, password) {
  try {
    const key = await getKey(password);
    const iv = Uint8Array.from(atob(data.iv), c => c.charCodeAt(0));
    const cypher = Uint8Array.from(atob(data.msg), c => c.charCodeAt(0));
    const decoded = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cypher);
    return dec.decode(decoded);
  } catch (e) { return "🔒 Encrypted Message"; }
}