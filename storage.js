/**
 * storage.js — IPFS storage via Pinata (hot) + Lighthouse (archival)
 *
 * Strategy:
 *   Pinata  = hot storage (instant IPFS access, free 1GB tier)
 *   Lighthouse Beacon = permanent Filecoin archival (future backup layer)
 *
 * For now, all uploads go through Pinata for instant availability.
 * Images load immediately on Basescan, OpenSea, wish.html, any browser.
 *
 * Gateway: https://ipfs.io/ipfs/{CID}
 */

const STORAGE = {

  JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI2ZGE4ZjBmZC0yOWNlLTRmMTMtOTQ3OS00NWFlMDFiMTBiOWQiLCJlbWFpbCI6InRoZWFpd29ybGRuZXRAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjZkMjJhMDIxODRjMWU1ZTQ5MjdjIiwic2NvcGVkS2V5U2VjcmV0IjoiMGQ3NWMzNjNmZWU0OWM3Njg4OTU1ODI5NzU0M2U2NjRjYmY3Mjc4OWFhY2VjNWNlMzNiMjMxMmJlMzVmYTZhZCIsImV4cCI6MTgwNzg1NzQ0MX0.ZNTBmoGRrPCbzI1eCeD-bRlnHmWS7trXmd2PkPMqb14',

  GATEWAY: 'https://ipfs.io/ipfs/',

  /**
   * Upload a base64 data URI (image) to IPFS.
   * Returns HTTPS gateway URL for universal compatibility.
   */
  async uploadImage(base64DataURI, filename = 'wish-image.jpg') {
    const res  = await fetch(base64DataURI);
    const blob = await res.blob();
    return await this._uploadBlob(blob, filename, 'image');
  },

  /**
   * Upload an audio Blob (voice note) to IPFS.
   */
  async uploadAudio(audioBlob, filename = 'wish-voice.webm') {
    return await this._uploadBlob(audioBlob, filename, 'audio');
  },

  /**
   * Core upload — Pinata pinFileToIPFS endpoint.
   */
  async _uploadBlob(blob, filename, type) {
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('pinataMetadata', JSON.stringify({
      name: filename,
      keyvalues: { app: 'EternalWishes', type }
    }));
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.JWT}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Upload failed (${response.status}): ${err}`);
    }

    const data = await response.json();
    if (!data.IpfsHash) throw new Error('No hash returned');

    // HTTPS gateway URL — works on Basescan, OpenSea, all browsers
    return `${this.GATEWAY}${data.IpfsHash}`;
  },

  /**
   * Convert any URI to displayable HTTPS URL.
   */
  toGatewayURL(uri) {
    if (!uri) return null;
    if (uri.startsWith('ipfs://')) return this.GATEWAY + uri.slice(7);
    return uri;
  },

  isIPFS(str) {
    return str && str.startsWith('ipfs://');
  },

  isGatewayURL(str) {
    return str && (
      str.includes('ipfs.io/ipfs/') ||
      str.includes('gateway.lighthouse.storage/ipfs/') ||
      str.includes('ipfs.io/ipfs/')
    );
  },
};

// Backward compatibility
const PINATA = STORAGE;

if (typeof module !== 'undefined') module.exports = { STORAGE, PINATA };
