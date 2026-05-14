import "server-only";
import type { CreateCheckoutRequest, CheckoutSession } from "./types";

/**
 * Stripe Payment Client
 * Handles payment processing and subscription management
 */

const STRIPE_CONFIG = {
  secretKey: process.env.STRIPE_SECRET_KEY,
  publicKey: process.env.STRIPE_PUBLIC_KEY,
  apiVersion: process.env.STRIPE_API_VERSION || "2023-10-16",
};

const BASE_URL = "https://api.stripe.com/v1";

class StripeClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit & { body?: any } = {}
  ): Promise<T> {
    if (!STRIPE_CONFIG.secretKey) {
      throw new Error(
        "Stripe secret key not configured. Set STRIPE_SECRET_KEY environment variable."
      );
    }

    const { body, ...fetchOptions } = options;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STRIPE_CONFIG.secretKey}`,
      "Stripe-Version": STRIPE_CONFIG.apiVersion,
      ...options.headers,
    };

    let requestBody: string | undefined;
    if (body) {
      if (options.method === "POST" || options.method === "PUT") {
        // Stripe uses form-encoded data
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        requestBody = new URLSearchParams(
          this.flattenObject(body)
        ).toString();
      }
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...fetchOptions,
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Stripe API error: ${error.error?.message || "Unknown error"}`
      );
    }

    return response.json();
  }

  private flattenObject(
    obj: any,
    prefix = ""
  ): Record<string, string> {
    const flattened: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}[${key}]` : key;

      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === "object" && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = String(value);
      }
    }

    return flattened;
  }

  async createCheckout(
    request: CreateCheckoutRequest
  ): Promise<CheckoutSession> {
    const {
      priceId,
      userId,
      email,
      successUrl = `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/success`,
      cancelUrl = `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/cancel`,
      metadata = {},
    } = request;

    const session = await this.request<any>("/checkout/sessions", {
      method: "POST",
      body: {
        mode: "payment",
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          ...metadata,
        },
      },
    });

    return {
      id: session.id,
      url: session.url,
      status: session.status,
    };
  }

  async createSubscription(
    customerId: string,
    priceId: string
  ): Promise<any> {
    return this.request("/subscriptions", {
      method: "POST",
      body: {
        customer: customerId,
        items: [{ price: priceId }],
      },
    });
  }

  async getCustomer(customerId: string): Promise<any> {
    return this.request(`/customers/${customerId}`, {
      method: "GET",
    });
  }

  async createCustomer(email: string, name?: string): Promise<any> {
    return this.request("/customers", {
      method: "POST",
      body: {
        email,
        name,
      },
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<any> {
    return this.request(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
  }

  async getPaymentIntent(paymentIntentId: string): Promise<any> {
    return this.request(`/payment_intents/${paymentIntentId}`, {
      method: "GET",
    });
  }

  async createPaymentIntent(
    amount: number,
    currency: string = "usd",
    metadata: Record<string, string> = {}
  ): Promise<any> {
    return this.request("/payment_intents", {
      method: "POST",
      body: {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata,
      },
    });
  }
}

export const stripe = new StripeClient();
