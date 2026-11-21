const crypto = require('crypto');

const md5Upper = (value) => crypto.createHash('md5').update(value).digest('hex').toUpperCase();

function config() {
  return {
    merchantId: process.env.PAYHERE_MERCHANT_ID || '',
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || '',
    checkoutUrl: process.env.PAYHERE_CHECKOUT_URL || 'https://sandbox.payhere.lk/pay/checkout',
    publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:8081',
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
  };
}

// The signature PayHere requires on the checkout request.
function checkoutHash({ merchantId, orderId, amount, currency, merchantSecret }) {
  return md5Upper(`${merchantId}${orderId}${amount}${currency}${md5Upper(merchantSecret)}`);
}

// The signature PayHere puts on its server-to-server notification. Checking it
// is what stops anyone marking a booking as paid by posting to the notify URL.
function notifySignature({ merchantId, orderId, amount, currency, statusCode, merchantSecret }) {
  return md5Upper(`${merchantId}${orderId}${amount}${currency}${statusCode}${md5Upper(merchantSecret)}`);
}

function verifyNotification(body, merchantSecret = config().merchantSecret) {
  if (!merchantSecret || typeof body.md5sig !== 'string') return false;
  const expected = notifySignature({
    merchantId: body.merchant_id,
    orderId: body.order_id,
    amount: body.payhere_amount,
    currency: body.payhere_currency,
    statusCode: body.status_code,
    merchantSecret
  });
  const a = Buffer.from(expected);
  const b = Buffer.from(body.md5sig.toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// PayHere status codes: 2 success, 0 pending, -1 cancelled, -2 failed, -3 chargeback.
function statusFromCode(code) {
  const n = Number(code);
  if (n === 2) return 'paid';
  if (n === 0) return 'pending';
  return 'failed';
}

module.exports = {
  name: 'payhere',
  checkoutHash,
  notifySignature,
  verifyNotification,
  statusFromCode,

  // Fields for a form the browser posts to PayHere's hosted checkout page.
  // Card details are entered there and never reach this system.
  checkout(payment, booking) {
    const c = config();
    const amount = Number(payment.amount).toFixed(2);
    const [firstName, ...rest] = booking.customer_name.split(' ');
    return {
      mode: 'redirect',
      action: c.checkoutUrl,
      fields: {
        merchant_id: c.merchantId,
        return_url: `${c.frontendOrigin}/my-bookings?payment=return`,
        cancel_url: `${c.frontendOrigin}/my-bookings?payment=cancelled`,
        notify_url: `${c.publicApiUrl}/api/payments/payhere/notify`,
        order_id: payment.order_ref,
        items: `${booking.service_name} at ${booking.garage_name}`.slice(0, 200),
        currency: payment.currency,
        amount,
        first_name: firstName,
        last_name: rest.join(' ') || '-',
        email: booking.customer_email,
        phone: booking.customer_phone || '0000000000',
        address: 'N/A',
        city: booking.garage_city,
        country: 'Sri Lanka',
        hash: checkoutHash({ merchantId: c.merchantId, orderId: payment.order_ref, amount, currency: payment.currency, merchantSecret: c.merchantSecret })
      }
    };
  }
};
