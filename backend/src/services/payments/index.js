const simulated = require('./simulatedProvider');
const payhere = require('./payhereProvider');

// The abstraction layer from report section 1.6: the rest of the system only
// knows "the provider", so PAYMENT_PROVIDER switches gateway with no other change.
const providers = { simulated, payhere };

function getProvider() {
  return providers[process.env.PAYMENT_PROVIDER] || simulated;
}

module.exports = { getProvider, providers };
