/**
 * Hyperliquid action signer
 * Uses @msgpack/msgpack for encoding — compatible with Hyperliquid's L1 signing.
 */

import { ethers } from 'ethers';
import { encode } from '@msgpack/msgpack';

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

function hashAction(action, nonce, vaultAddress = null) {
  const actionBytes = encode(action);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(BigInt(nonce));

  let suffix;
  if (vaultAddress) {
    const vaultBytes = Buffer.from(vaultAddress.replace('0x', ''), 'hex');
    suffix = Buffer.concat([Buffer.from([0x01]), vaultBytes]);
  } else {
    suffix = Buffer.from([0x00]);
  }

  const full = Buffer.concat([Buffer.from(actionBytes), nonceBuf, suffix]);
  return ethers.keccak256(full);
}

export class HyperliquidSigner {
  constructor(privateKey, network = 'mainnet') {
    this.wallet = new ethers.Wallet(privateKey);
    this.address = this.wallet.address;
    this.isMainnet = network === 'mainnet';
  }

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

  async buildOrderAction(params) {
    const { assetIndex, isBuy, price, size, reduceOnly = false, tif = 'Gtc', vaultAddress = null } = params;
    const action = {
      type: 'order',
      orders: [{
        a: assetIndex,
        b: isBuy,
        p: HyperliquidSigner.normalizePrice(price),  // strip trailing zeros
        s: size,
        r: reduceOnly,
        t: { limit: { tif } },
      }],
      grouping: 'na',
    };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  async buildCancelAction(cancels, vaultAddress = null) {
    const action = {
      type: 'cancel',
      cancels: cancels.map(c => ({ a: c.assetIndex, o: c.oid })),
    };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  async buildModifyAction(params, vaultAddress = null) {
    const { oid, assetIndex, isBuy, price, size, reduceOnly = false, tif = 'Gtc' } = params;
    const action = {
      type: 'batchModify',
      modifies: [{ oid, order: { a: assetIndex, b: isBuy, p: price, s: size, r: reduceOnly, t: { limit: { tif } } } }],
    };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  async buildSetLeverageAction(assetIndex, leverage, isCross = true, vaultAddress = null) {
    const action = { type: 'updateLeverage', asset: assetIndex, isCross, leverage };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  /**
   * Build a native Hyperliquid trigger order (stop loss or take profit).
   * These appear as real orders on Hyperliquid's UI and survive HyperVibe restarts.
   */
  async buildTriggerOrderAction(params) {
    const {
      assetIndex, isBuy, triggerPx, size,
      isMarket = true, limitPx = null, tpsl = 'sl', vaultAddress = null,
    } = params;

    const order = {
      a: assetIndex,
      b: isBuy,
      p: isMarket ? '0' : (limitPx ?? triggerPx),
      s: size,
      r: true,
      t: { trigger: { triggerPx, isMarket, tpsl } },
    };

    const action = { type: 'order', orders: [order], grouping: 'na' };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  /**
   * Build a batch of exit orders (SL + TPs) in a single action.
   */
  async buildExitBatchAction(assetIndex, orders, vaultAddress = null) {
    const hlOrders = orders.map(o => ({
      a: assetIndex,
      b: o.isBuy,
      p: o.isMarket ? '0' : (o.limitPx ?? o.triggerPx),
      s: o.size,
      r: true,
      t: { trigger: { triggerPx: o.triggerPx, isMarket: o.isMarket ?? true, tpsl: o.tpsl } },
    }));

    const action = { type: 'order', orders: hlOrders, grouping: 'positionTpsl' };
    const nonce = Date.now();
    const signature = await this.sign(action, nonce, vaultAddress);
    return { action, nonce, signature, vaultAddress };
  }

  static marketPrice(midPx, isBuy, slippagePct = 3) {
    const factor = isBuy ? 1 + slippagePct / 100 : 1 - slippagePct / 100;
    return HyperliquidSigner.normalizePrice((midPx * factor).toPrecision(5));
  }

  /**
   * Normalize a price string to match Hyperliquid's Python normalization.
   * Python strips trailing zeros: "40.480" → "40.48", "41.000" → "41"
   */
  static normalizePrice(s) {
    if (!String(s).includes('.')) return String(s);
    return String(s).replace(/\.?0+$/, '');
  }

  static formatSize(size, szDecimals) {
    return parseFloat(size).toFixed(szDecimals);
  }
}
