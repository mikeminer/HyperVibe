/**
 * Compares msgpack encoding of entry vs exit order actions.
 * Run from: C:\Users\mikfo\HyperVibe\hypervibe
 * node debug-msgpack.mjs
 */

import 'dotenv/config';
import { encode } from '@msgpack/msgpack';
import { ethers } from 'ethers';

const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const wallet = new ethers.Wallet(PRIVATE_KEY);

function hashAction(action, nonce) {
  const actionBytes = encode(action);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(BigInt(nonce));
  const full = Buffer.concat([Buffer.from(actionBytes), nonceBuf, Buffer.from([0x00])]);
  return { bytes: Buffer.from(actionBytes).toString('hex'), hash: ethers.keccak256(full) };
}

async function signAndCheck(action, label) {
  const nonce = 1000000; // fixed nonce for comparison
  const { bytes, hash } = hashAction(action, nonce);

  const agent = { source: 'a', connectionId: hash };
  const domain = { chainId: 1337, name: 'Exchange', verifyingContract: '0x0000000000000000000000000000000000000000', version: '1' };
  const types = { Agent: [{ name: 'source', type: 'string' }, { name: 'connectionId', type: 'bytes32' }] };

  const rawSig = await wallet.signTypedData(domain, types, agent);
  const sig = ethers.Signature.from(rawSig);

  // Recover the address Hyperliquid would see
  const recovered = ethers.verifyTypedData(domain, types, agent, rawSig);

  console.log(`\n=== ${label} ===`);
  console.log('Action:', JSON.stringify(action));
  console.log('Msgpack bytes:', bytes);
  console.log('Action hash:', hash);
  console.log('Recovered signer:', recovered);
  console.log('Wallet address: ', wallet.address);
  console.log('Match:', recovered.toLowerCase() === wallet.address.toLowerCase() ? '✓ YES' : '✗ NO');
}

// Entry order (works)
await signAndCheck({
  type: 'order',
  orders: [{ a: 159, b: true, p: '41.694', s: '0.28', r: false, t: { limit: { tif: 'Ioc' } } }],
  grouping: 'na',
}, 'ENTRY (buy, r:false, Ioc)');

// Exit order (fails)
await signAndCheck({
  type: 'order',
  orders: [{ a: 159, b: false, p: '41.730', s: '0.28', r: true, t: { limit: { tif: 'Gtc' } } }],
  grouping: 'na',
}, 'EXIT (sell, r:true, Gtc)');

// Test: same as exit but r:false
await signAndCheck({
  type: 'order',
  orders: [{ a: 159, b: false, p: '41.730', s: '0.28', r: false, t: { limit: { tif: 'Gtc' } } }],
  grouping: 'na',
}, 'TEST (sell, r:false, Gtc)');

// Test: same as entry but b:false
await signAndCheck({
  type: 'order',
  orders: [{ a: 159, b: false, p: '41.694', s: '0.28', r: false, t: { limit: { tif: 'Ioc' } } }],
  grouping: 'na',
}, 'TEST (sell, r:false, Ioc)');

// Test: r:true only difference from working entry
await signAndCheck({
  type: 'order',
  orders: [{ a: 159, b: true, p: '41.694', s: '0.28', r: true, t: { limit: { tif: 'Ioc' } } }],
  grouping: 'na',
}, 'TEST (buy, r:TRUE, Ioc)');
