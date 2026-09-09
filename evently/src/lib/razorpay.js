export class CheckoutDismissedError extends Error {
  constructor() {
    super('Checkout was closed before payment was completed.');
    this.name = 'CheckoutDismissedError';
  }
}

export const openRazorpayCheckout = ({ checkout, event, user, quantity, onFailure }) => new Promise((resolve, reject) => {
  if (!window.Razorpay) {
    reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.'));
    return;
  }

  const razorpay = new window.Razorpay({
    key: checkout.keyId,
    amount: checkout.amountPaise,
    currency: checkout.currency,
    name: 'Evently',
    description: `${event.title} · ${quantity} ticket${quantity === 1 ? '' : 's'}`,
    order_id: checkout.providerOrderId,
    handler: resolve,
    prefill: {
      name: user.username,
      email: user.email,
    },
    notes: {
      eventId: String(event.id),
    },
    modal: {
      ondismiss: () => reject(new CheckoutDismissedError()),
    },
    retry: { enabled: true },
    theme: { color: '#7c3aed' },
  });

  razorpay.on('payment.failed', (response) => {
    const description = response?.error?.description || 'Razorpay could not complete the payment.';
    onFailure?.(description);
  });
  razorpay.open();
});
