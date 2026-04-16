/**
 * pinata.js — IPFS upload via Pinata
 *
 * Handles image and audio uploads for Premium and Eternal wishes.
 * Returns ipfs:// URIs that go on-chain as imageURL and audioHash reference.
 *
 * SECURITY NOTE:
 * This JWT is scoped to pinFileToIPFS only and restricted to your domain.
 * It cannot read, delete or manage your Pinata account.
 * Rotate at: https://app.pinata.cloud/keys
 */

const PINATA = {

  JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI2ZGE4ZjBmZC0yOWNlLTRmMTMtOTQ3OS00NWFlMDFiMTBiOWQiLCJlbWFpbCI6InRoZWFpd29ybGRuZXRAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjZkMjJhMDIxODRjMWU1ZTQ5MjdjIiwic2NvcGVkS2V5U2VjcmV0IjoiMGQ3NWMzNjNmZWU0OWM3Njg4OTU1ODI5NzU0M2U2NjRjYmY3Mjc4OWFhY2VjNWNlMzNiMjMxMmJlMzVmYTZhZCIsImV4cCI6MTgwNzg1NzQ0MX0.ZNTBmoGRrPCbzI1eCeD-bRlnHmWS7trXmd2PkPMqb14',

  // Public IPFS gateway for reading files back
  GATEWAY: 'https://gateway.pinata.cloud/ipfs/',

  /**
   * Upload a base64 data URI (image) to IPFS.
   * Returns the ipfs:// URI e.g. "ipfs://QmXxx..."
   *
   * @param {string} base64DataURI  - e.g. "data:image/jpeg;base64,/9j/4AAQ..."
   * @param {string} filename       - e.g. "wish-image.jpg"
   * @returns {string}              - "ipfs://QmHash..."
   */
  async uploadImage(base64DataURI, filename = 'wish-image.jpg') {
    // Convert base64 data URI to Blob
    const res   = await fetch(base64DataURI);
    const blob  = await res.blob();
    return await this._uploadBlob(blob, filename, 'image');
  },

  /**
   * Upload an audio Blob (voice note) to IPFS.
   * Returns the ipfs:// URI.
   *
   * @param {Blob}   audioBlob  - recorded audio blob (audio/webm)
   * @param {string} filename
   * @returns {string}          - "ipfs://QmHash..."
   */
  async uploadAudio(audioBlob, filename = 'wish-voice.webm') {
    return await this._uploadBlob(audioBlob, filename, 'audio');
  },

  /**
   * Core upload function — sends file to Pinata pinFileToIPFS endpoint.
   */
  async _uploadBlob(blob, filename, type) {
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('pinataMetadata', JSON.stringify({
      name: filename,
      keyvalues: { app: 'EternalWishes', type }
    }));
    formData.append('pinataOptions', JSON.stringify({
      cidVersion: 1   // CIDv1 — shorter, more modern
    }));

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.JWT}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Pinata upload failed (${response.status}): ${err}`);
    }

    const data = await response.json();
    if (!data.IpfsHash) throw new Error('Pinata returned no hash');

    return `ipfs://${data.IpfsHash}`;
  },

  /**
   * Convert an ipfs:// URI to an https:// gateway URL for display.
   * Used by wish.html to render images and audio from IPFS.
   *
   * @param {string} ipfsURI  - "ipfs://QmHash..."
   * @returns {string}        - "https://gateway.pinata.cloud/ipfs/QmHash..."
   */
  toGatewayURL(ipfsURI) {
    if (!ipfsURI) return null;
    if (ipfsURI.startsWith('ipfs://')) {
      return this.GATEWAY + ipfsURI.slice(7);
    }
    // Already a gateway URL or base64 — return as-is
    return ipfsURI;
  },

  /**
   * Check if a string is an IPFS URI
   */
  isIPFS(str) {
    return str && str.startsWith('ipfs://');
  },
};

// Export for Node.js if needed
if (typeof module !== 'undefined') module.exports = { PINATA };
