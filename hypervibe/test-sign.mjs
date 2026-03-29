import 'dotenv/config';
import { ethers } from 'ethers';
import { pack } from 'msgpackr';

const WALLET_ADDRESS = process.env.HL_WALLET_ADDRESS;
const PRIVATE_KEY    = process.env.HL_PRIVATE_KEY;
const BASE_URL       = 'https://api.hyperliquid.xyz';

console.log('\n=== HyperVibe Signing Test ===');
console.log('Wallet  :', WALLET_ADDRESS);
console.log('Key     :', PRIVATE_KEY?.slice(0,6) + '...' + PRIVATE_KEY?.slice(-4));

const wallet = new ethers.Wallet(PRIVATE_KEY);
console.log('Derived :', wallet.address);
console.log('Match   :', wallet.address.toLowerCase() === WALLET_ADDRESS?.toLowerCase() ? 'YES ✓' : 'NO ✗');

// Step 1: get HYPE asset index
const metaRes = await fetch(`${BASE_URL}/info`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'meta' }),
});
const meta = await metaRes.json();
const hypeIdx = meta.universe.findIndex(u => u.name === 'HYPE');
console.log('\nHYPE asset index:', hypeIdx);
console.log('HYPE info:', JSON.stringify(meta.universe[hypeIdx]));

// Step 2: get HYPE price
const midsRes = await fetch(`${BASE_URL}/info`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'allMids' }),
});
const mids = await midsRes.json();
const hypePx = parseFloat(mids['HYPE']);
console.log('HYPE mid price:', hypePx);

// Step 3: build order action
const isBuy = true;
const slippage = 1.05; // 5% slippage for market
const price = (hypePx * slippage).toPrecision(5);
const size = '0.015';

const action = {
  type: 'order',
  orders: [{
    a: hypeIdx,
    b: isBuy,
    p: price,
    s: size,
    r: false,
    t: { limit: { tif: 'Ioc' } },
  }],
  grouping: 'na',
};

console.log('\nAction:', JSON.stringify(action));

// Step 4: sign
const nonce = Date.now();
const actionBytes = pack(action);
const nonceBuf = Buffer.alloc(8);
nonceBuf.writeBigUInt64BE(BigInt(nonce));
const full = Buffer.concat([actionBytes, nonceBuf, Buffer.from([0x00])]);
const actionHash = ethers.keccak256(full);

console.log('Action hash:', actionHash);

const domain = {
  chainId: 1337,
  name: 'Exchange',
  verifyingContract: '0x0000000000000000000000000000000000000000',
  version: '1',
};
const types = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};
const agent = { source: 'a', connectionId: actionHash };

const rawSig = await wallet.signTypedData(domain, types, agent);
const sig = ethers.Signature.from(rawSig);

console.log('Signature r:', sig.r.slice(0, 12) + '...');
console.log('Signer addr:', wallet.address);

// Step 5: submit
const payload = {
  action,
  nonce,
  signature: { r: sig.r, s: sig.s, v: sig.v },
};

console.log('\nSubmitting to Hyperliquid...');
const res = await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const result = await res.json();
console.log('\nRaw response:', JSON.stringify(result, null, 2));
