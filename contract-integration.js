/**
 * contract-integration.js
 *
 * Drop this file into your frontend project.
 * Usage in eternal-wishes.html:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js"></script>
 *   <script src="pinata.js"></script>
 *   <script src="contract-integration.js"></script>
 *
 * Production contract: EternalWishes / WISH
 * Deployed: Base Mainnet — 0xdaB67208DFF64A428a60Db1BaF0A4091aAda1175
 *
 * WishParams tuple (9 fields):
 *   (to, message, from, occasion, imageURL, audioCID, audioProof, theme, campaignHash)
 *   campaignHash = bytes32(0) for personal wishes
 *   audioCID     = IPFS CID for voice note (cross-device playback)
 *   audioProof   = SHA-256 hex (on-chain verification)
 */

// ── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  CONTRACT_ADDRESS: "0xdaB67208DFF64A428a60Db1BaF0A4091aAda1175",

  // Base Mainnet
  CHAIN_ID:        8453,
  RPC_URL:         "https://mainnet.base.org",
  CHAIN_NAME:      "Base",
  NATIVE_CURRENCY: { name: "Ether", symbol: "ETH", decimals: 18 },
  EXPLORER:        "https://basescan.org",

  // Base Sepolia — uncomment for development
  // CHAIN_ID:        84532,
  // RPC_URL:         "https://sepolia.base.org",
  // CHAIN_NAME:      "Base Sepolia",
  // NATIVE_CURRENCY: { name: "Ether", symbol: "ETH", decimals: 18 },
  // EXPLORER:        "https://sepolia.basescan.org",
};

// ── ABI ───────────────────────────────────────────────────────────────────
// WishParams tuple: (to, message, from, occasion, imageURL, audioCID, audioProof, theme, campaignHash)
// campaignHash is bytes32 — use ethers.constants.HashZero for personal wishes
const ABI = [
  // ── Write ──
  "function mintWish(uint8,(string,string,string,string,string,string,string,string,bytes32)) external payable returns (uint256)",
  "function mintWishRelayer(address,uint8,(string,string,string,string,string,string,string,string,bytes32)) external returns (uint256)",

  // ── Read ──
  "function getWish(uint256) external view returns (tuple(address minter,address payer,string to,string message,string from,string occasion,string imageURL,string audioCID,string audioProof,string theme,bytes32 campaignHash,uint8 tier,uint64 timestamp,bool upiPayment))",
  "function getWishes(uint256[]) external view returns (tuple(address,address,string,string,string,string,string,string,string,string,bytes32,uint8,uint64,bool)[])",
  "function allPrices() external view returns (uint256,uint256,uint256)",
  "function getPrice(uint8) external view returns (uint256)",
  "function tokenURI(uint256) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function contractBalance() external view returns (uint256)",
  "function getActiveCampaigns() external view returns (tuple(string id,string recipientName,string occasion,string defaultMessage,string imageURL,uint64 eventDate,bool active)[])",
  "function getCampaign(string) external view returns (tuple(string id,string recipientName,string occasion,string defaultMessage,string imageURL,uint64 eventDate,bool active))",
  "function getQueryHash(string,bytes32) external pure returns (bytes32)",

  // ── Admin ──
  "function setPrices(uint256,uint256,uint256) external",
  "function setRelayer(address,bool) external",
  "function setFeeCollector(address) external",
  "function setPaused(bool) external",
  "function withdraw() external",
  "function createCampaign(tuple(string,string,string,string,string,uint64,bool)) external",

  // ── Events ──
  // WishMinted: queryHash = keccak256(occasion + campaignHash) for filtering
  "event WishMinted(uint256 indexed tokenId, address indexed minter, bytes32 indexed queryHash, uint8 tier, string to, string occasion, bytes32 campaignHash, bool upiPayment, uint64 timestamp)",
  "event WishMintedFull(uint256 indexed tokenId, address indexed minter, address payer, string to, string message, string from, string occasion, string imageURL, string audioCID, string audioProof, string theme, bytes32 campaignHash, uint8 tier, bool upiPayment, uint64 timestamp)",
  "event CampaignCreated(bytes32 indexed campaignHash, string id, string recipientName, string occasion)",
];

const TIER_MAP = { basic: 0, premium: 1, eternal: 2 };

// bytes32(0) — used as campaignHash for all personal (non-campaign) wishes
const NO_CAMPAIGN = ethers.constants.HashZero;  // "0x0000...0000"

// ── Main integration object ───────────────────────────────────────────────
const EternalWishes = {

  provider: null,
  signer:   null,
  contract: null,
  readOnly: null,

  // ── INIT ──────────────────────────────────────────────────────────────

  initReadOnly() {
    this.readOnly = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    return new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, this.readOnly);
  },

  async connectWallet() {
    if (!window.ethereum) throw new Error("No wallet detected. Please install MetaMask.");

    await window.ethereum.request({ method: "eth_requestAccounts" });
    this.provider = new ethers.providers.Web3Provider(window.ethereum);

    const { chainId } = await this.provider.getNetwork();
    if (chainId !== CONFIG.CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CONFIG.CHAIN_ID.toString(16) }],
        });
      } catch (e) {
        if (e.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId:          "0x" + CONFIG.CHAIN_ID.toString(16),
              chainName:        CONFIG.CHAIN_NAME,
              nativeCurrency:   CONFIG.NATIVE_CURRENCY,
              rpcUrls:          [CONFIG.RPC_URL],
              blockExplorerUrls:[CONFIG.EXPLORER],
            }],
          });
        } else {
          throw e;
        }
      }
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
    }

    this.signer   = this.provider.getSigner();
    this.contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, this.signer);

    // Listen for account changes (user switches wallet in MetaMask)
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        // Disconnected
        document.getElementById('walletDot').classList.remove('connected');
        document.getElementById('walletLabel').textContent = 'Connect Wallet';
        document.getElementById('myWishesBtn').style.display = 'none';
      } else {
        // Switched account — update display
        const addr = accounts[0];
        document.getElementById('walletDot').classList.add('connected');
        document.getElementById('walletLabel').textContent = addr.slice(0,6) + '…' + addr.slice(-4);
        // Re-init signer and contract for new account
        EternalWishes.provider = new ethers.providers.Web3Provider(window.ethereum);
        EternalWishes.signer = EternalWishes.provider.getSigner();
        EternalWishes.contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, EternalWishes.signer);
      }
    });

    return await this.signer.getAddress();
  },

  // ── MINT — CRYPTO PATH ────────────────────────────────────────────────

  /**
   * Mint a wish by paying ETH directly.
   * WishParams now has 9 fields — audioCID, audioProof, campaignHash are new.
   *
   * @param {object} wish  from collectWishData()
   * @returns {{ tokenId, txHash, explorerURL }}
   */
  async mintCrypto(wish) {
    if (!this.contract) throw new Error("Wallet not connected. Call connectWallet() first.");

    const tierNum  = TIER_MAP[wish.tier] ?? 0;
    const price    = await this.contract.getPrice(tierNum);

    // campaignHash: bytes32(0) for personal wishes, or keccak256 of campaign id
    const campaignHash = wish.campaignHash || NO_CAMPAIGN;

    const tx = await this.contract.mintWish(
      tierNum,
      [
        wish.recipient   || "",
        wish.message     || "",
        wish.sender      || "",
        wish.occasion    || "birthday",
        wish.imageURL    || "",     // ipfs:// URI (Premium+)
        wish.audioCID    || "",     // ipfs:// CID of voice note (Eternal)
        wish.audioProof  || "",     // SHA-256 hex of voice note (Eternal)
        wish.theme       || "classic",
        campaignHash,               // bytes32 — NO_CAMPAIGN for personal wishes
      ],
      { value: price }
    );

    const receipt = await tx.wait();

    const parsedEvent = receipt.logs
      .map(log => { try { return this.contract.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "WishMinted");

    const tokenId = parsedEvent?.args?.tokenId
      ? Number(parsedEvent.args.tokenId)
      : null;

    if (!tokenId) throw new Error("Could not read tokenId from transaction receipt");

    return {
      tokenId,
      txHash:      receipt.transactionHash,
      explorerURL: `${CONFIG.EXPLORER}/tx/${receipt.transactionHash}`,
    };
  },

  // ── MINT — UPI/CARD PATH (RELAYER BACKEND) ────────────────────────────

  /**
   * Called by Node.js backend after Onramp.money confirms payment.
   * NEVER call this from frontend — relayerPrivateKey must stay server-side.
   */
  async mintRelayerBackend(recipientAddress, wish, relayerPrivateKey) {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const relayer  = new ethers.Wallet(relayerPrivateKey, provider);
    const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, relayer);

    const tierNum      = TIER_MAP[wish.tier] ?? 0;
    const campaignHash = wish.campaignHash || NO_CAMPAIGN;

    const tx = await contract.mintWishRelayer(
      recipientAddress,
      tierNum,
      [
        wish.recipient   || "",
        wish.message     || "",
        wish.sender      || "",
        wish.occasion    || "birthday",
        wish.imageURL    || "",
        wish.audioCID    || "",
        wish.audioProof  || "",
        wish.theme       || "classic",
        campaignHash,
      ],
      { gasLimit: 400_000 }
    );

    const receipt = await tx.wait();

    const parsedEvent = receipt.logs
      .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "WishMinted");

    return {
      tokenId:     parsedEvent?.args?.tokenId ? Number(parsedEvent.args.tokenId) : null,
      txHash:      receipt.transactionHash,
      explorerURL: `${CONFIG.EXPLORER}/tx/${receipt.transactionHash}`,
    };
  },

  // ── READ WISH ─────────────────────────────────────────────────────────

  async getWish(tokenId) {
    const c = this.contract || this.initReadOnly();
    const raw = await c.getWish(tokenId);

    const tierName = ["basic", "premium", "eternal"][Number(raw.tier)] || "basic";

    // Look up txHash from events so Basescan link works on any device
    let txHash = null;
    try {
      const provider = this.provider || this.readOnly || c.provider;
      const latest   = await provider.getBlockNumber();
      const filter   = c.filters.WishMinted(BigInt(tokenId));
      const events   = await c.queryFilter(filter, Math.max(0, latest - 100000), latest);
      if (events.length > 0) txHash = events[0].transactionHash;
    } catch(e) {
      console.log('txHash lookup skipped:', e.message);
    }

    return {
      tokenId:       Number(tokenId),
      minter:        raw.minter,
      payer:         raw.payer,
      to:            raw.to,
      message:       raw.message,
      from:          raw.from,
      occasion:      raw.occasion,
      imageURL:      raw.imageURL    || null,
      audioCID:      raw.audioCID    || null,  // IPFS CID — use for cross-device playback
      audioProof:    raw.audioProof  || null,  // SHA-256 — display as verification proof
      theme:         raw.theme       || "classic",
      campaignHash:  raw.campaignHash,
      tier:          tierName,
      timestamp:     new Date(Number(raw.timestamp) * 1000).toISOString(),
      upiPayment:    raw.upiPayment,
      isFirstOfDay:  false,
      txHash:        txHash,
      // Device-local — not available from chain read on other devices
      imageData:     null,
      audioBase64:   null,
      audioURL:      null,
      audioIPFSURL:  null,
    };
  },

  // ── PRICES ────────────────────────────────────────────────────────────

  async getPrices() {
    const c = this.contract || this.initReadOnly();
    const [basic, premium, eternal] = await c.allPrices();
    return {
      basic:      ethers.utils.formatEther(basic),
      premium:    ethers.utils.formatEther(premium),
      eternal:    ethers.utils.formatEther(eternal),
      basicWei:   basic,
      premiumWei: premium,
      eternalWei: eternal,
    };
  },

  // ── CAMPAIGNS ─────────────────────────────────────────────────────────

  /**
   * Get all active campaigns for the homepage campaign cards.
   */
  async getActiveCampaigns() {
    const c = this.contract || this.initReadOnly();
    const campaigns = await c.getActiveCampaigns();
    return campaigns.map(camp => ({
      id:             camp.id,
      recipientName:  camp.recipientName,
      occasion:       camp.occasion,
      defaultMessage: camp.defaultMessage,
      imageURL:       camp.imageURL,
      eventDate:      new Date(Number(camp.eventDate) * 1000).toISOString(),
      active:         camp.active,
      // Compute campaignHash for use in mintWish
      campaignHash:   ethers.utils.keccak256(ethers.utils.toUtf8Bytes(camp.id)),
    }));
  },

  /**
   * Get all wishes for a campaign (by campaign id string).
   * Queries WishMinted events filtered by queryHash.
   */
  async getCampaignWishes(occasionSlug, campaignId, count = 50) {
    const c        = this.contract || this.initReadOnly();
    const provider = this.provider || this.readOnly;
    const latest   = await provider.getBlockNumber();

    // Compute the same queryHash the contract used when minting
    const campaignHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(campaignId));
    const queryHash    = await c.getQueryHash(occasionSlug, campaignHash);

    const filter = c.filters.WishMinted(null, null, queryHash);
    const events = await c.queryFilter(filter, 0, latest);

    return events.slice(-count).reverse().map(e => ({
      tokenId:   Number(e.args.tokenId),
      minter:    e.args.minter,
      to:        e.args.to,
      occasion:  e.args.occasion,
      timestamp: new Date(Number(e.args.timestamp) * 1000).toISOString(),
    }));
  },

  /**
   * Get all wishes minted by a specific wallet address.
   * Used for "My Wishes" when wallet is connected.
   */
  async getWishesByWallet(walletAddress, count = 50) {
    const c        = this.contract || this.initReadOnly();
    const provider = this.provider || this.readOnly;
    const latest   = await provider.getBlockNumber();

    // Filter WishMinted by indexed minter field
    const filter = c.filters.WishMinted(null, walletAddress);
    const events = await c.queryFilter(filter, 0, latest);

    return events.slice(-count).reverse().map(e => ({
      tokenId:      Number(e.args.tokenId),
      minter:       e.args.minter,
      to:           e.args.to,
      occasion:     e.args.occasion,
      tier:         ["basic","premium","eternal"][Number(e.args.tier)] || "basic",
      campaignHash: e.args.campaignHash,
      timestamp:    new Date(Number(e.args.timestamp) * 1000).toISOString(),
    }));
  },

  // ── RECENT FEED ───────────────────────────────────────────────────────

  async getRecentWishes(count = 10) {
    const c        = this.contract || this.initReadOnly();
    const provider = this.provider || this.readOnly;
    const latest   = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - 5000);

    const filter = c.filters.WishMintedFull();
    const events = await c.queryFilter(filter, fromBlock, latest);

    return events
      .slice(-count)
      .reverse()
      .map(e => ({
        tokenId:   Number(e.args.tokenId),
        minter:    e.args.minter,
        to:        e.args.to,
        message:   e.args.message,
        from:      e.args.from,
        occasion:  e.args.occasion,
        imageURL:  e.args.imageURL,
        audioCID:  e.args.audioCID,
        theme:     e.args.theme,
        tier:      ["basic","premium","eternal"][Number(e.args.tier)] || "basic",
        timestamp: new Date(Number(e.args.timestamp) * 1000).toISOString(),
      }));
  },

  // ── UTILS ─────────────────────────────────────────────────────────────

  wishURL(tokenId) {
    const origin = window.location.origin;
    const path   = window.location.pathname;
    const dir    = path.substring(0, path.lastIndexOf("/") + 1);
    return `${origin}${dir}wish.html?id=${tokenId}`;
  },

  explorerURL(txHash) {
    return `${CONFIG.EXPLORER}/tx/${txHash}`;
  },

  /**
   * Compute campaignHash from a campaign id string.
   * Use this in the frontend when building WishParams for a campaign wish.
   * e.g. EternalWishes.toCampaignHash("modi-birthday-2025")
   */
  toCampaignHash(campaignId) {
    if (!campaignId) return NO_CAMPAIGN;
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(campaignId));
  },
};

// Export for Node.js backend (relayer script)
if (typeof module !== "undefined") module.exports = { EternalWishes, CONFIG, ABI, NO_CAMPAIGN };
