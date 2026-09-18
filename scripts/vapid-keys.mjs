// Prints a fresh VAPID key pair for Web Push. Run once, keep the private key
// secret: locally in .dev.vars, in production via `wrangler secret put`.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

console.log(`VAPID_PUBLIC_KEY=${Buffer.from(publicRaw).toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`);
