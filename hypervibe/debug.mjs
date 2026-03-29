import 'dotenv/config';
import { ethers } from 'ethers';

const key    = process.env.HL_PRIVATE_KEY;
const wallet = process.env.HL_WALLET_ADDRESS;

console.log('');
console.log('=== HyperVibe .env Debug ===');
console.log('HL_WALLET_ADDRESS :', wallet ?? 'NON IMPOSTATA');
console.log('HL_PRIVATE_KEY    :', key ? key.slice(0,6) + '...' + key.slice(-4) : 'NON IMPOSTATA');

if (!key) {
  console.log('\nERRORE: HL_PRIVATE_KEY non trovata nel .env');
  process.exit(1);
}

try {
  const w = new ethers.Wallet(key);
  console.log('Indirizzo derivato :', w.address);
  if (wallet) {
    const match = w.address.toLowerCase() === wallet.toLowerCase();
    console.log('Corrisponde?       :', match ? 'SI ✓' : 'NO ✗ — chiave sbagliata');
    if (!match) {
      console.log('\nIl wallet nel .env è   :', wallet);
      console.log('La chiave appartiene a :', w.address);
      console.log('\nDevi usare la chiave privata di', wallet);
    }
  }
} catch(e) {
  console.log('Chiave non valida  :', e.message);
}
console.log('');
