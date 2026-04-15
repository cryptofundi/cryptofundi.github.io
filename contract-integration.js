/**
 * contract-integration.js
 *
 * Drop this file into your frontend project.
 * Replace the PLACEHOLDER comments in eternal-wishes.html with calls from here.
 *
 * Usage in eternal-wishes.html:
 *   <script src="https://cdn.ethers.io/lib/ethers-5.2.umd.min.js"></script>
 *   <script src="contract-integration.js"></script>
 *
 * Then replace PLACEHOLDER blocks with:
 *   const tokenId = await EternalWishes.mintCrypto(wishData);   // crypto path
 *   const tokenId = await EternalWishes.mintRelayer(wishData);  // UPI/Card path
 */

// ── CONFIG — update after deployment ──────────────────────────────────────
const CONFIG = {
  // PLACEHOLDER: Replace with actual deployed address after deploy.js
  CONTRACT_ADDRESS: "0xCCc9B111713D8CD98973ca744c7082003274C6da",

  // Base Mainnet
  CHAIN_ID:        8453,
  RPC_URL:         "https://mainnet.base.org",
  CHAIN_NAME:      "Base",
  NATIVE_CURRENCY: { name: "Ether", symbol: "ETH", decimals: 18 },
  EXPLORER:        "https://basescan.org",

  // Base Sepolia Testnet — uncomment for development
  // CHAIN_ID:        84532,
  // RPC_URL:         "https://sepolia.base.org",
  // CHAIN_NAME:      "Base Sepolia",
  // NATIVE_CURRENCY: { name: "Ether", symbol: "ETH", decimals: 18 },
  // EXPLORER:        "https://sepolia.basescan.org",
};

const ABI = [
  // Write — WishParams tuple: (to, message, from, occasion, imageURL, audioHash, theme)
  "function mintWish(uint8,(string,string,string,string,string,string,string)) external payable returns (uint256)",
  "function mintWishRelayer(address,uint8,(string,string,string,string,string,string,string)) external returns (uint256)",
  // Read
  "function getWish(uint256) external view returns (tuple(address minter,address payer,string to,string message,string from,string occasion,string imageURL,string audioHash,string theme,uint8 tier,uint64 timestamp,bool upiPayment))",
  "function getWishes(uint256[]) external view returns (tuple(address,address,string,string,string,string,string,string,string,uint8,uint64,bool)[])",
  "function allPrices() external view returns (uint256,uint256,uint256)",
  "function getPrice(uint8) external view returns (uint256)",
  "function tokenURI(uint256) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function contractBalance() external view returns (uint256)",
  "function setPrices(uint256,uint256,uint256) external",
  "function setRelayer(address,bool) external",
  "function setPaused(bool) external",
  "function withdraw() external",
  // Events
  "event WishMinted(uint256 indexed tokenId, address indexed minter, uint8 indexed tier, string to, string occasion, bool upiPayment, uint64 timestamp)",
  "event WishMintedFull(uint256 indexed tokenId, address indexed minter, address payer, string to, string message, string from, string occasion, string imageURL, string audioHash, string theme, uint8 tier, bool upiPayment, uint64 timestamp)",
];

const TIER_MAP = { basic: 0, premium: 1, eternal: 2 };

// ── Main integration object ───────────────────────────────────────────────
const EternalWishes = {

  provider:  null,
  signer:    null,
  contract:  null,
  readOnly:  null,   // for read calls (no wallet needed)

  // ── INIT ───────────────────────────────────────────────────────────────

  /**
   * Connect to read-only provider (no wallet).
   * Used for loading wish pages (/wish.html?id=XXX).
   */
  initReadOnly() {
    this.readOnly = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    this.readOnly.network = { chainId: CONFIG.CHAIN_ID, name: CONFIG.CHAIN_NAME };
    return new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, this.readOnly);
  },

  /**
   * Connect wallet (MetaMask / WalletConnect).
   * Returns connected address.
   */
  async connectWallet() {
    if (!window.ethereum) throw new Error("No wallet detected. Please install MetaMask.");

    // Request accounts
    await window.ethereum.request({ method: "eth_requestAccounts" });

    this.provider = new ethers.providers.Web3Provider(window.ethereum);

    // Check network and switch if needed
    const { chainId } = await this.provider.getNetwork();
    if (chainId !== CONFIG.CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CONFIG.CHAIN_ID.toString(16) }],
        });
      } catch (e) {
        if (e.code === 4902) {
          // Chain not added — add Polygon
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
      // Re-init after switch
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
    }

    this.signer   = this.provider.getSigner();
    this.contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, this.signer);

    return await this.signer.getAddress();
  },

  // ── MINT — CRYPTO PATH ─────────────────────────────────────────────────

  /**
   * Mint a wish by paying MATIC directly.
   * Replaces the PLACEHOLDER in handleCryptoFlow().
   *
   * @param {object} wish  - wish data object from collectWishData()
   * @returns {number}     - tokenId
   */
  async mintCrypto(wish) {
    if (!this.contract) throw new Error("Wallet not connected. Call connectWallet() first.");

    const tierNum = TIER_MAP[wish.tier] ?? 0;

    // Get price from contract (always fresh — not hardcoded)
    const price = await this.contract.getPrice(tierNum);

    const tx = await this.contract.mintWish(
      tierNum,
      [                              // WishParams tuple
        wish.recipient    || "",
        wish.message      || "",
        wish.sender       || "",
        wish.occasion     || "birthday",
        wish.imageIPFSHash || "",
        wish.audioHash    || "",
        wish.theme        || "classic",
      ],
      { value: price }
    );

    const receipt = await tx.wait();

    // Peer fix: receipt.events can be undefined on Base and some providers.
    // Safer: parse logs directly using the contract interface.
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

  // ── MINT — UPI/CARD PATH (RELAYER) ─────────────────────────────────────

  /**
   * Called by your backend after Onramp.money confirms payment.
   * NOT called from frontend directly — this runs in your Node.js backend.
   *
   * @param {string} recipientAddress  - user's wallet address (or a session wallet)
   * @param {object} wish              - wish data
   * @param {string} relayerPrivateKey - from environment variable (never in frontend)
   */
  async mintRelayerBackend(recipientAddress, wish, relayerPrivateKey) {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const relayer  = new ethers.Wallet(relayerPrivateKey, provider);
    const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, ABI, relayer);

    const tierNum = TIER_MAP[wish.tier] ?? 0;

    const tx = await contract.mintWishRelayer(
      recipientAddress,
      tierNum,
      [                              // WishParams tuple
        wish.recipient    || "",
        wish.message      || "",
        wish.sender       || "",
        wish.occasion     || "birthday",
        wish.imageIPFSHash || "",
        wish.audioHash    || "",
        wish.theme        || "classic",
      ],
      { gasLimit: 300_000 }
    );

    const receipt = await tx.wait();

    // Same safer log parsing as mintCrypto — works reliably on Base
    const parsedEvent = receipt.logs
      .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "WishMinted");

    return {
      tokenId:     parsedEvent?.args?.tokenId ? Number(parsedEvent.args.tokenId) : null,
      txHash:      receipt.transactionHash,
      explorerURL: `${CONFIG.EXPLORER}/tx/${receipt.transactionHash}`,
    };
  },

  // ── READ WISH ──────────────────────────────────────────────────────────

  /**
   * Read a wish from the blockchain by tokenId.
   * Replaces loadWish() in wish.html after removing mock data.
   *
   * @param {number|string} tokenId
   * @returns {object} wish data
   */
  async getWish(tokenId) {
    const c = this.contract || this.initReadOnly();
    const raw = await c.getWish(tokenId);

    // Map tuple to named object
    return {
      tokenId:    Number(tokenId),
      minter:     raw.minter,
      payer:      raw.payer,
      to:         raw.to,
      message:    raw.message,
      from:       raw.from,
      occasion:   raw.occasion,
      imageURL:   raw.imageURL,
      audioHash:  raw.audioHash,
      theme:      raw.theme,
      tier:       ["basic", "premium", "eternal"][raw.tier] || "basic",
      timestamp:  new Date(Number(raw.timestamp) * 1000).toISOString(),
      upiPayment: raw.upiPayment,
      isFirstOfDay: false,  // compute separately if needed
    };
  },

  /**
   * IMPORTANT: Call this right after deployment from Remix to set correct prices.
   * Default prices in contract (0.2/0.5/1.0 ETH) are too high for India.
   * At ETH ~$3500 (~₹291,000):
   *   ₹19  = ~0.000065 ETH = 65000000000000  wei
   *   ₹49  = ~0.000168 ETH = 168000000000000 wei
   *   ₹99  = ~0.000340 ETH = 340000000000000 wei
   * Call setPrices(65000000000000, 168000000000000, 340000000000000) in Remix.
   * Update these values any time via Remix → Deployed Contracts → setPrices.
   */
  async setPrices(basicWei, premiumWei, eternalWei) {
    if (!this.contract) throw new Error("Wallet not connected");
    const tx = await this.contract.setPrices(basicWei, premiumWei, eternalWei);
    await tx.wait();
    console.log("Prices updated");
  },
  async getPrices() {
    const c = this.contract || this.initReadOnly();
    const [basic, premium, eternal] = await c.allPrices();
    return {
      basic:   ethers.utils.formatEther(basic),    // e.g. "0.2"
      premium: ethers.utils.formatEther(premium),
      eternal: ethers.utils.formatEther(eternal),
      basicWei:   basic,
      premiumWei: premium,
      eternalWei: eternal,
    };
  },

  /**
   * Get the most recently minted wishes for the feed.
   * Reads WishMintedFull events for the last N blocks.
   */
  async getRecentWishes(count = 10) {
    const c        = this.contract || this.initReadOnly();
    const provider = this.provider || this.readOnly;
    const latest   = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - 5000);  // ~5000 blocks ≈ recent activity window on Base (~25 min at 2s block time)

    const filter = c.filters.WishMintedFull();
    const events = await c.queryFilter(filter, fromBlock, latest);

    // Most recent first, limited to count
    return events
      .slice(-count)
      .reverse()
      .map(e => ({
        tokenId:   e.args.tokenId.toNumber(),
        minter:    e.args.minter,
        to:        e.args.to,
        message:   e.args.message,
        from:      e.args.from,
        occasion:  e.args.occasion,
        imageURL:  e.args.imageURL,
        theme:     e.args.theme,
        tier:      ["basic","premium","eternal"][e.args.tier] || "basic",
        timestamp: new Date(Number(e.args.timestamp) * 1000).toISOString(),
      }));
  },

  // ── UTILS ──────────────────────────────────────────────────────────────

  wishURL(tokenId) {
    const origin = window.location.origin;
    const path   = window.location.pathname;
    const dir    = path.substring(0, path.lastIndexOf("/") + 1);
    return `${origin}${dir}wish.html?id=${tokenId}`;
  },

  explorerURL(txHash) {
    return `${CONFIG.EXPLORER}/tx/${txHash}`;
  },
};

// Export for Node.js (backend relayer script)
if (typeof module !== "undefined") module.exports = { EternalWishes, CONFIG, ABI };
