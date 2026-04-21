/**
 * contract-integration.js
 *
 * Production contract v5: EternalWishes / WISH
 * Deployed: Base Mainnet — 0xC51b7B6B4af1B62dc604324c89b386b10F67716D
 *
 * v5 changes: Campaign → Moment, host fee split, PaymentSplit event
 *
 * WishParams tuple (9 fields):
 *   (to, message, from, occasion, imageURL, audioCID, audioProof, theme, momentHash)
 *   momentHash = bytes32(0) for personal wishes
 */

// ── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  CONTRACT_ADDRESS: "0xC51b7B6B4af1B62dc604324c89b386b10F67716D",

  CHAIN_ID:        8453,
  RPC_URL:         "https://mainnet.base.org",
  CHAIN_NAME:      "Base",
  NATIVE_CURRENCY: { name: "Ether", symbol: "ETH", decimals: 18 },
  EXPLORER:        "https://basescan.org",
};

// ── ABI ───────────────────────────────────────────────────────────────────
const ABI = [
  // ── Write ──
  "function mintWish(uint8,(string,string,string,string,string,string,string,string,bytes32)) external payable returns (uint256)",
  "function mintWishRelayer(address,uint8,(string,string,string,string,string,string,string,string,bytes32)) external returns (uint256)",
  "function createMoment(bytes32,(string,string,string,string,string,uint64,bool)) external payable",

  // ── Read ──
  "function getWish(uint256) external view returns (tuple(address minter,address payer,string to,string message,string from,string occasion,string imageURL,string audioCID,string audioProof,string theme,bytes32 momentHash,uint8 tier,uint64 timestamp,bool upiPayment))",
  "function getWishes(uint256[]) external view returns (tuple(address,address,string,string,string,string,string,string,string,string,bytes32,uint8,uint64,bool)[])",
  "function allPrices() external view returns (uint256,uint256,uint256)",
  "function getPrice(uint8) external view returns (uint256)",
  "function tokenURI(uint256) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function contractBalance() external view returns (uint256)",
  "function getMoment(bytes32) external view returns (tuple(string id,string recipientName,string occasion,string defaultMessage,string imageURL,uint64 eventDate,bool active))",
  "function getMomentHost(bytes32) external view returns (address)",
  "function getActiveMoments() external view returns (tuple(string id,string recipientName,string occasion,string defaultMessage,string imageURL,uint64 eventDate,bool active)[])",
  "function getQueryHash(string,bytes32) external pure returns (bytes32)",
  "function momentHost(bytes32) external view returns (address)",
  "function hostFeePercent() external view returns (uint256)",
  "function momentCreationFee() external view returns (uint256)",
  "function pending(address) external view returns (uint256)",

  // ── Admin ──
  "function setPrices(uint256,uint256,uint256) external",
  "function setRelayer(address,bool) external",
  "function setFeeCollector(address) external",
  "function setHostFeePercent(uint256) external",
  "function setMomentCreationFee(uint256) external",
  "function setPaused(bool) external",
  "function withdraw() external",
  "function withdrawPending() external",
  "function setMomentActive(bytes32,bool) external",
  "function updateMoment(bytes32,string,string) external",

  // ── Events ──
  "event WishMinted(uint256 indexed tokenId, address indexed minter, bytes32 indexed queryHash, uint8 tier, string to, string occasion, bytes32 momentHash, bool upiPayment, uint64 timestamp)",
  "event WishMintedFull(uint256 indexed tokenId, address indexed minter, address payer, string to, string message, string from, string occasion, string imageURL, string audioCID, string audioProof, string theme, bytes32 momentHash, uint8 tier, bool upiPayment, uint64 timestamp)",
  "event PaymentSplit(uint256 indexed tokenId, bytes32 indexed momentHash, address host, uint256 hostShare, uint256 platformShare)",
  "event MomentCreated(bytes32 indexed momentHash, address indexed host, string id, string recipientName, string occasion)",
];

const TIER_MAP = { basic: 0, premium: 1, eternal: 2 };
const NO_CAMPAIGN = ethers.constants.HashZero;  // bytes32(0) for personal wishes

// ── Main integration object ───────────────────────────────────────────────
const EternalWishes = {

  provider: null,
  signer:   null,
  contract: null,
  readOnly: null,
  _listenersRegistered: false,

  // ── INIT ──────────────────────────────────────────────────────────────

  initReadOnly() {
    this.readOnly = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    return new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, this.readOnly);
  },

  async connectWallet() {
    if (!window.ethereum) throw new Error("No wallet detected. Please install MetaMask.");

    if (this._wasDisconnected) {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }]
      });
      this._wasDisconnected = false;
    } else {
      await window.ethereum.request({ method: "eth_requestAccounts" });
    }
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

    if (!this._listenersRegistered) {
      this._listenersRegistered = true;

      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          this.signer = null;
          this.contract = null;
          this._onDisconnect();
        } else {
          this.provider = new ethers.providers.Web3Provider(window.ethereum);
          this.signer   = this.provider.getSigner();
          this.contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, this.signer);
          this._onAccountChange(accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return await this.signer.getAddress();
  },

  _onDisconnect() {},
  _onAccountChange(addr) {},

  // ── MINT — CRYPTO PATH ────────────────────────────────────────────────

  async mintCrypto(wish) {
    if (!this.contract) throw new Error("Wallet not connected. Call connectWallet() first.");

    const tierNum  = TIER_MAP[wish.tier] ?? 0;
    const price    = await this.contract.getPrice(tierNum);
    const momentHash = wish.momentHash || NO_CAMPAIGN;

    const tx = await this.contract.mintWish(
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
        momentHash,
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

  async mintRelayerBackend(recipientAddress, wish, relayerPrivateKey) {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const relayer  = new ethers.Wallet(relayerPrivateKey, provider);
    const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, relayer);

    const tierNum      = TIER_MAP[wish.tier] ?? 0;
    const momentHash = wish.momentHash || NO_CAMPAIGN;

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
        momentHash,
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

  // ── CREATE MOMENT ─────────────────────────────────────────────────────

  /**
   * Create a public moment. Anyone can call.
   * @param {string} slug       - e.g. "modi-birthday-2026"
   * @param {object} moment     - { recipientName, occasion, defaultMessage, imageURL, eventDate }
   * @returns {{ momentHash, txHash }}
   */
  async createMomentOnChain(slug, moment) {
    if (!this.contract) throw new Error("Wallet not connected.");

    const momentHash = this.toMomentHash(slug);
    const creationFee = await this.contract.momentCreationFee();

    const tx = await this.contract.createMoment(
      momentHash,
      [
        slug,                          // id
        moment.recipientName || "",
        moment.occasion      || "custom",
        moment.defaultMessage || "",
        moment.imageURL       || "",
        moment.eventDate      || 0,    // Unix timestamp
        true,                          // active
      ],
      { value: creationFee }
    );

    const receipt = await tx.wait();

    return {
      momentHash,
      slug,
      txHash:      receipt.transactionHash,
      explorerURL: `${CONFIG.EXPLORER}/tx/${receipt.transactionHash}`,
    };
  },

  // ── READ WISH ─────────────────────────────────────────────────────────

  async getWish(tokenId) {
    const c = this.contract || this.initReadOnly();
    const raw = await c.getWish(tokenId);

    const tierName = ["basic", "premium", "eternal"][Number(raw.tier)] || "basic";

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
      audioCID:      raw.audioCID    || null,
      audioProof:    raw.audioProof  || null,
      theme:         raw.theme       || "classic",
      momentHash:    raw.momentHash,
      tier:          tierName,
      timestamp:     new Date(Number(raw.timestamp) * 1000).toISOString(),
      upiPayment:    raw.upiPayment,
      isFirstOfDay:  false,
      txHash:        txHash,
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

  // ── MOMENTS ───────────────────────────────────────────────────────────

  async getActiveMoments() {
    const c = this.contract || this.initReadOnly();
    const moments = await c.getActiveMoments();
    return moments.map(m => ({
      id:             m.id,
      recipientName:  m.recipientName,
      occasion:       m.occasion,
      defaultMessage: m.defaultMessage,
      imageURL:       m.imageURL,
      eventDate:      new Date(Number(m.eventDate) * 1000).toISOString(),
      active:         m.active,
      momentHash:     ethers.utils.keccak256(ethers.utils.toUtf8Bytes(m.id)),
    }));
  },

  async getMomentWishes(occasionSlug, momentSlug, count = 50) {
    const c        = this.contract || this.initReadOnly();
    const provider = this.provider || this.readOnly;
    const latest   = await provider.getBlockNumber();

    const momentHash = this.toMomentHash(momentSlug);
    const queryHash  = await c.getQueryHash(occasionSlug, momentHash);

    const filter = c.filters.WishMinted(null, null, queryHash);
    const events = await c.queryFilter(filter, 0, latest);

    return events.slice(-count).reverse().map(e => ({
      tokenId:     Number(e.args.tokenId),
      minter:      e.args.minter,
      to:          e.args.to,
      occasion:    e.args.occasion,
      momentHash:  e.args.momentHash,
      timestamp:   new Date(Number(e.args.timestamp) * 1000).toISOString(),
    }));
  },

  async getWishesByWallet(walletAddress, count = 100) {
    const c        = this.contract || this.initReadOnly();
    const provider = this.provider || this.readOnly;
    const latest   = await provider.getBlockNumber();

    const filter = c.filters.WishMinted(null, walletAddress);
    const events = await c.queryFilter(filter, 0, latest);

    return events.slice(-count).reverse().map(e => ({
      tokenId:      Number(e.args.tokenId),
      minter:       e.args.minter,
      to:           e.args.to,
      occasion:     e.args.occasion,
      tier:         ["basic","premium","eternal"][Number(e.args.tier)] || "basic",
      momentHash:   e.args.momentHash,
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
        tokenId:     Number(e.args.tokenId),
        minter:      e.args.minter,
        to:          e.args.to,
        message:     e.args.message,
        from:        e.args.from,
        occasion:    e.args.occasion,
        imageURL:    e.args.imageURL,
        audioCID:    e.args.audioCID,
        theme:       e.args.theme,
        momentHash:  e.args.momentHash,
        tier:        ["basic","premium","eternal"][Number(e.args.tier)] || "basic",
        timestamp:   new Date(Number(e.args.timestamp) * 1000).toISOString(),
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

  toMomentHash(slug) {
    if (!slug) return NO_CAMPAIGN;
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(slug));
  },
};

// Export for Node.js backend
if (typeof module !== "undefined") module.exports = { EternalWishes, CONFIG, ABI, NO_CAMPAIGN };
