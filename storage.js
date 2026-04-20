/**
 * storage.js — Permanent IPFS storage via Lighthouse
 *
 * Pay once, stored forever on IPFS + Filecoin.
 * Replaces pinata.js — same interface, permanent storage.
 *
 * Gateway: https://gateway.lighthouse.storage/ipfs/{CID}
 * Docs: https://docs.lighthouse.storage
 */

const STORAGE = {

  API_KEY: 'aa55319f.ab15cf3b98f74943b2cf787b97350776',

  UPLOAD_URL: 'https://node.lighthouse.storage/api/v0/add',

  GATEWAY: 'https://gateway.lighthouse.storage/ipfs/',

  /**
   * Upload a base64 data URI (image) to IPFS via Lighthouse.
   * Returns an HTTPS gateway URL for universal compatibility.
   *
   * @param {string} base64DataURI  - e.g. "data:image/jpeg;base64,/9j/4AAQ..."
   * @param {string} filename       - e.g. "wish-image.jpg"
   * @returns {string}              - "https://gateway.lighthouse.storage/ipfs/QmHash..."
   */
  async uploadImage(base64DataURI, filename = 'wish-image.jpg') {
    const res  = await fetch(base64DataURI);
    const blob = await res.blob();
    return await this._uploadBlob(blob, filename);
  },

  /**
   * Upload an audio Blob (voice note) to IPFS via Lighthouse.
   *
   * @param {Blob}   audioBlob  - recorded audio blob (audio/webm)
   * @param {string} filename
   * @returns {string}          - "https://gateway.lighthouse.storage/ipfs/QmHash..."
   */
  async uploadAudio(audioBlob, filename = 'wish-voice.webm') {
    return await this._uploadBlob(audioBlob, filename);
  },

  /**
   * Core upload — sends file to Lighthouse node API.
   * Lighthouse stores on IPFS immediately + Filecoin for permanence.
   */
  async _uploadBlob(blob, filename) {
    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await fetch(this.UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Lighthouse upload failed (${response.status}): ${err}`);
    }

    const data = await response.json();
    const hash = data.Hash || data.cid;
    if (!hash) throw new Error('Lighthouse returned no hash');

    // Return HTTPS gateway URL — works on Basescan, OpenSea, all browsers
    return `${this.GATEWAY}${hash}`;
  },

  /**
   * Convert any supported URI to an HTTPS gateway URL for display.
   * Handles: ipfs:// URIs, gateway URLs, base64, direct URLs.
   *
   * @param {string} uri  - "ipfs://QmHash..." or "https://gateway..." or base64
   * @returns {string}    - HTTPS URL ready for <img> or <audio> src
   */
  toGatewayURL(uri) {
    if (!uri) return null;
    if (uri.startsWith('ipfs://')) {
      return this.GATEWAY + uri.slice(7);
    }
    // Already an HTTPS URL, base64, or other — return as-is
    return uri;
  },

  /**
   * Check if a string is an IPFS URI (ipfs:// protocol)
   */
  isIPFS(str) {
    return str && str.startsWith('ipfs://');
  },

  /**
   * Check if a string is a gateway URL (from Lighthouse or Pinata)
   */
  isGatewayURL(str) {
    return str && (
      str.includes('gateway.lighthouse.storage/ipfs/') ||
      str.includes('gateway.pinata.cloud/ipfs/') ||
      str.includes('ipfs.io/ipfs/') ||
      str.includes('nftstorage.link/ipfs/')
    );
  },
};

// Backward compatibility — code that references PINATA will still work
const PINATA = STORAGE;

// Export for Node.js if needed
if (typeof module !== 'undefined') module.exports = { STORAGE, PINATA };
