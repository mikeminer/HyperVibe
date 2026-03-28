/**
 * Hyperliquid action signer
 * Implements the L1 EIP-712 signing scheme required by the exchange API.
 * Reference: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 */

import { ethers } from 'ethers';
import { pack } from 'msgpackr';

// Hyperliquid uses chainId 1337 for their L1
const HL_CHAIN_ID = 1337;

const AGENT_DOMAIN = {
  chainId: HL_CHAIN_ID,
  name: 'Exchange',
  verifyingContract: '0x0000000000000000000000000000000000000000',
  version: '1',
};

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

/**
 * Hash a Hyperliquid action using msgpack + keccak256.
 * Layout: msgpack(action) | uint64BE(nonce) | (vaultAddress bytes | 0x00)
 */
function hashAction(action, nonce, vaultAddress = null) {
  const actionBytes = pack(action);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(BigInt(nonce));

  let suffix;
  if (vaultAddress) {
    suffix = Buffer.from(vaultAddress.replace('0x', ''), 'hex');
  } else {
    suffix = Buffer.from([0x00]);
  }

  const full = Buffer.concat([actionBytes, nonceBuf, suffix]);
  return ethers.keccak256(full);
}

export class HyperliquidSigner {
  constructor(privateKey, network = 'mainnet') {
    this.wallet = new ethers.Wallet(privateKey);
    this.address = this.wallet.address;
    this.isMainnet = network === 'mainnet';
  }

  /**
   * Sign a Hyperliquid action and return { r, s, v } signature.
   */
  async sign(action, nonce, vaultAddress = null) {
    const actionHash = hashAction(action, nonce, vaultAddress);

    const agent = {
      source: this.isMainnet ? 'a' : 'b',
      connectionId: actionHash,
    };

    const rawSig = await this.wallet.signTypedData(AGENT_DOMAIN, AGENT_TYPES, agent);
    const sig = ethers.Signature.from(rawSig);

    return { r: sig.r, s: sig.s, v: sig.v };
  }

  /**
   * Build and sign an order action.
   * @param {object} params
   * @param {number} params.assetIndex  - integer index from meta.universe
   * @param {boolean} params.isBuy
   * @param {string} params.price       - string, '0' for market
   * @param {string} params.size        - string
   * @param {boolean} params.reduceOnly
   * @param {'Gtc'|'Ioc'|'Alo'} params.tif
   * @param {string|null} params.vaultAddress
   */
  async buildOrderAction(params) {
    const {
      assetIndex,
      isBuy,
      price,
      size,
      reduceOnly = false,
      tif = 'Gtc',
      vaultAddress = null,
    } = params;

    const isMarket = price === '0' || tif === 'Ioc';

    const action = {
      type: 'order',
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: price,
        s: size,
        r: reduceOnly,
        t: isMarket
          ? { limit: { tif: 'Ioc' } }
          : { limit: { tif } },
      }],
      grouping: 'na',
    };

    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);

    return { action, nonce, signature, vaultAddress };
  }

  /**
   * Build and sign a cancel action.
   */
  async buildCancelAction(cancels, vaultAddress = null) {
    // cancels: [{ assetIndex, oid }]
    const action = {
      type: 'cancel',
      cancels: cancels.map(c => ({ a: c.assetIndex, o: c.oid })),
    };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  /**
   * Build and sign a modify order action.
   */
  async buildModifyAction(params, vaultAddress = null) {
    const { oid, assetIndex, isBuy, price, size, reduceOnly = false, tif = 'Gtc' } = params;
    const action = {
      type: 'batchModify',
      modifies: [{
        oid,
        order: {
          a: assetIndex,
          b: isBuy,
          p: price,
          s: size,
          r: reduceOnly,
          t: { limit: { tif } },
        },
      }],
    };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  /**
   * Build and sign a set leverage action.
   */
  async buildSetLeverageAction(assetIndex, leverage, isCross = true, vaultAddress = null) {
    const action = {
      type: 'updateLeverage',
      asset: assetIndex,
      isCross,
      leverage,
    };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  /**
   * Compute slippage-adjusted price for market orders.
   * Buy: +slippage%, Sell: -slippage%
   */
  static marketPrice(midPx, isBuy, slippagePct = 3) {
    const factor = isBuy ? 1 + slippagePct / 100 : 1 - slippagePct / 100;
    // Round to 5 sig figs (Hyperliquid requirement)
    return (midPx * factor).toPrecision(5);
  }

  /**
   * Format size to the correct number of decimals for the asset.
   */
  static formatSize(size, szDecimals) {
    return parseFloat(size).toFixed(szDecimals);
  }
}
