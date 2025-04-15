// Shim for undici to provide necessary exports for cheerio
const fetch = require('node-fetch');

// Provide a minimal undici-like interface
module.exports = {
  fetch,
  // Provide a dummy stream export that cheerio might be looking for
  stream: require('stream')
}; 