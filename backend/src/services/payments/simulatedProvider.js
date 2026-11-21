// Stands in for a payment gateway, so the whole flow can be demonstrated even
// if sandbox access is lost (report section 4.4). It never handles card data.
module.exports = {
  name: 'simulated',

  // The frontend shows its own test-mode screen for this provider.
  checkout(payment) {
    return { mode: 'simulated', paymentId: payment.id };
  }
};
