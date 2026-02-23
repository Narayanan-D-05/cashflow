/**
 * src/server/openapi.ts
 * OpenAPI 3.1 specification for the CashFlow402 API.
 * Served at GET /docs (Swagger UI) and GET /openapi.json (raw spec).
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CashFlow402 API',
    version: '1.0.0',
    description: 'BCH-native HTTP-402 micropayment and CashToken subscription protocol. Pay-per-call and recurring subscription access control backed by Bitcoin Cash smart contracts on ChipNet / Mainnet.',
    contact: {
      name: 'CashFlow402',
      url: 'https://github.com/Narayanan-D-05/cashflow',
      email: 'hi@cashflow402.dev',
    },
    license: { name: 'ISC' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local dev (ChipNet)' },
  ],
  tags: [
    { name: 'Health', description: 'Service liveness' },
    { name: 'Per-call', description: 'HTTP-402 pay-per-call flow' },
    { name: 'Subscription', description: 'CashToken subscription lifecycle' },
    { name: 'Webhook', description: 'On-chain event notifications' },
    { name: 'Demo', description: 'Protected demo endpoints' },
    { name: 'Merchant', description: 'Merchant dashboard operations' },
  ],
  components: {
    securitySchemes: {
      BearerJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT issued by POST /verify-payment (per-call) or GET /subscription/verify (subscription)',
      },
      PaymentToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Payment-Token',
        description: 'Alternative to Authorization header for payment JWTs',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', description: 'Human-readable error message' },
          detail: { type: 'string', description: 'Additional context (optional)' },
          hint: { type: 'string', description: 'Suggested remediation (optional)' },
        },
      },
      PaymentChallenge: {
        type: 'object',
        required: ['nonce', 'paymentUri', 'amountSats', 'merchantAddress', 'verifyUrl', 'expiresAt'],
        properties: {
          nonce: { type: 'string', description: 'Single-use nonce (expires in 2 minutes)' },
          paymentUri: { type: 'string', description: 'BIP-21 payment URI' },
          amountSats: { type: 'integer', description: 'Required payment amount in satoshis' },
          merchantAddress: { type: 'string', description: 'Merchant BCH address' },
          verifyUrl: { type: 'string', description: 'POST here with { txid, nonce } to redeem' },
          expiresAt: { type: 'integer', description: 'Unix timestamp when this challenge expires' },
        },
      },
      AccessToken: {
        type: 'object',
        required: ['accessToken', 'expiresInSeconds'],
        properties: {
          accessToken: { type: 'string', description: 'Signed JWT for API access' },
          expiresInSeconds: { type: 'integer', description: 'Token lifetime in seconds' },
        },
      },
      SubscriptionRecord: {
        type: 'object',
        required: ['contractAddress', 'tokenCategory', 'status', 'intervalBlocks', 'authorizedSats', 'balance'],
        properties: {
          contractAddress: { type: 'string', description: 'BCH P2SH address of the covenant' },
          tokenAddress: { type: 'string', description: 'Token-address form of the contract (for NFT outputs)' },
          tokenCategory: { type: 'string', description: 'CashToken category hex (32-byte genesis txid)' },
          merchantPkh: { type: 'string', description: 'Merchant public key hash (20-byte hex)' },
          subscriberPkh: { type: 'string', description: 'Subscriber public key hash (20-byte hex)' },
          subscriberAddress: { type: 'string', description: 'Subscriber BCH address' },
          merchantAddress: { type: 'string', description: 'Merchant BCH address' },
          intervalBlocks: { type: 'integer', description: 'Blocks between claim intervals (144 ≈ 1 day)' },
          authorizedSats: { type: 'string', description: 'Max sats merchant may claim per interval' },
          lastClaimBlock: { type: 'integer', description: 'Block height of last claim (or subscription start)' },
          balance: { type: 'string', description: 'Current contract UTXO balance in satoshis' },
          status: { type: 'string', enum: ['pending_funding', 'active', 'cancelled', 'expired'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DeploySubscriptionRequest: {
        type: 'object',
        required: ['subscriberAddress'],
        properties: {
          subscriberAddress: { type: 'string', description: 'BCH address of the subscriber (bchtest:… or bitcoincash:…)' },
          intervalBlocks: { type: 'integer', default: 144, description: 'Blocks between claim intervals' },
          authorizedSats: { type: 'integer', default: 50000, description: 'Max sats per interval' },
        },
      },
      DeploySubscriptionResponse: {
        type: 'object',
        required: ['contractAddress', 'tokenAddress', 'tokenCategory', 'genesisCommitment', 'fundingUri', 'startBlock'],
        properties: {
          contractAddress: { type: 'string' },
          tokenAddress: { type: 'string', description: 'Send the genesis NFT to this address' },
          tokenCategory: { type: 'string', description: 'Placeholder category (updated after funding confirmed)' },
          intervalBlocks: { type: 'integer' },
          authorizedSats: { type: 'integer' },
          genesisCommitment: { type: 'string', description: 'Required NFT commitment (16-byte hex: lastClaimBlock || authorizedSats)' },
          fundingUri: { type: 'string', description: 'BIP-21 URI for the genesis funding transaction' },
          startBlock: { type: 'integer' },
          fundingInstructions: { type: 'string' },
          hint: { type: 'string' },
        },
      },
      FundConfirmRequest: {
        type: 'object',
        required: ['txid', 'tokenCategory', 'contractAddress'],
        properties: {
          txid: { type: 'string', description: 'Txid of the funding transaction' },
          tokenCategory: { type: 'string', description: 'NFT token category (32-byte hex = genesis txid)' },
          contractAddress: { type: 'string', description: 'Contract P2SH address' },
        },
      },
      ClaimRequest: {
        type: 'object',
        required: ['contractAddress', 'tokenCategory'],
        properties: {
          contractAddress: { type: 'string' },
          tokenCategory: { type: 'string' },
        },
      },
      ClaimResponse: {
        type: 'object',
        required: ['txid', 'claimedSats', 'nextClaimAfterBlock'],
        properties: {
          txid: { type: 'string', description: 'Broadcast txid of the claim transaction' },
          claimedSats: { type: 'integer', description: 'Satoshis transferred to merchant' },
          nextClaimAfterBlock: { type: 'integer', description: 'Block height after which next claim is valid' },
        },
      },
      CancelRequest: {
        type: 'object',
        required: ['contractAddress', 'subscriberWif'],
        properties: {
          contractAddress: { type: 'string' },
          subscriberWif: { type: 'string', description: 'Subscriber WIF private key (demo only — use client-side signing in production)' },
        },
      },
      VerifyPaymentRequest: {
        type: 'object',
        required: ['txid', 'nonce'],
        properties: {
          txid: { type: 'string', description: 'BCH transaction id of the payment' },
          nonce: { type: 'string', description: 'One-time nonce from the 402 challenge' },
        },
      },
      WebhookTxConfirmedRequest: {
        type: 'object',
        required: ['txid', 'confirmations'],
        properties: {
          txid: { type: 'string' },
          contractAddress: { type: 'string' },
          tokenCategory: { type: 'string' },
          confirmations: { type: 'integer' },
        },
      },
      WebhookBlockRequest: {
        type: 'object',
        required: ['height'],
        properties: {
          height: { type: 'integer', description: 'New block height' },
          hash: { type: 'string', description: 'Block hash' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid JWT',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      PaymentRequired: {
        description: 'Payment required — body contains a payment challenge',
        headers: {
          'X-Payment-Challenge': {
            description: 'Nonce for this challenge',
            schema: { type: 'string' },
          },
        },
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/ErrorResponse' },
                { $ref: '#/components/schemas/PaymentChallenge' },
              ],
            },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      BadRequest: {
        description: 'Invalid request body',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
  },

  // ─── Paths ────────────────────────────────────────────────────────────────

  paths: {

    // ── Health ──────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Service is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'CashFlow402' },
                    version: { type: 'string', example: '1.0.0' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Per-call: Challenge ──────────────────────────────────────────────────
    '/payment/challenge': {
      get: {
        tags: ['Per-call'],
        summary: 'Get a manual payment challenge',
        description: 'Returns a BIP-21 payment URI + nonce without gating a resource. Useful for SDK testing.',
        operationId: 'getPaymentChallenge',
        responses: {
          '200': {
            description: 'Payment challenge',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentChallenge' } } },
          },
          '500': {
            description: 'Server misconfiguration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },

    // ── Per-call: Verify ─────────────────────────────────────────────────────
    '/verify-payment': {
      post: {
        tags: ['Per-call'],
        summary: 'Verify a BCH payment and receive an access JWT',
        description: 'Consumes the nonce, verifies the on-chain transaction output, and issues a short-lived JWT.',
        operationId: 'verifyPayment',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyPaymentRequest' } } },
        },
        responses: {
          '200': {
            description: 'Payment verified — JWT issued',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AccessToken' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '402': { $ref: '#/components/responses/PaymentRequired' },
        },
      },
    },

    // ── Subscription: Deploy ─────────────────────────────────────────────────
    '/deploy-subscription': {
      post: {
        tags: ['Subscription'],
        summary: 'Deploy a new AutoPaySubscription covenant',
        description: 'Derives the P2SH covenant address from merchant + subscriber PKH + interval. Non-broadcast — returns funding instructions for the genesis NFT transaction.',
        operationId: 'deploySubscription',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DeploySubscriptionRequest' } } },
        },
        responses: {
          '201': {
            description: 'Subscription covenant deployed (pending funding)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DeploySubscriptionResponse' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': {
            description: 'Merchant key not configured',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },

    // ── Subscription: Fund Confirm ────────────────────────────────────────────
    '/subscription/fund-confirm': {
      post: {
        tags: ['Subscription'],
        summary: 'Confirm a subscription funding transaction',
        description: 'Subscriber notifies the server after broadcasting the genesis NFT tx. Server verifies on-chain and transitions the subscription to `active`.',
        operationId: 'fundConfirm',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FundConfirmRequest' } } },
        },
        responses: {
          '200': {
            description: 'Subscription activated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    contractAddress: { type: 'string' },
                    tokenCategory: { type: 'string' },
                    balance: { type: 'integer' },
                    commitment: { type: 'string' },
                    record: { $ref: '#/components/schemas/SubscriptionRecord' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '402': { $ref: '#/components/responses/PaymentRequired' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Subscription: Status ─────────────────────────────────────────────────
    '/subscription/status/{contractAddress}': {
      get: {
        tags: ['Subscription'],
        summary: 'Get subscription status',
        description: 'Returns the current state including on-chain balance, claim eligibility, and next claim block.',
        operationId: 'getSubscriptionStatus',
        parameters: [
          {
            name: 'contractAddress',
            in: 'path',
            required: true,
            description: 'BCH P2SH address of the subscription covenant',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Subscription status',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SubscriptionRecord' },
                    {
                      type: 'object',
                      properties: {
                        currentBlock: { type: 'integer' },
                        nextClaimAfterBlock: { type: 'integer' },
                        blocksUntilNextClaim: { type: 'integer' },
                        canClaimNow: { type: 'boolean' },
                      },
                    },
                  ],
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Subscription: List ────────────────────────────────────────────────────
    '/subscription/list': {
      get: {
        tags: ['Subscription'],
        summary: 'List all subscriptions',
        description: 'Returns all subscription records managed by this server instance. In-memory only — resets on server restart.',
        operationId: 'listSubscriptions',
        responses: {
          '200': {
            description: 'All subscriptions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    subscriptions: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SubscriptionRecord' },
                    },
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Subscription: Claim ───────────────────────────────────────────────────
    '/subscription/claim': {
      post: {
        tags: ['Subscription'],
        summary: 'Merchant claims one interval payment',
        description: 'Builds and broadcasts a CashScript claim transaction. The covenant verifies that the interval has elapsed and that the claimed amount does not exceed `authorizedSats`. Updates the mutable NFT commitment.',
        operationId: 'claimSubscription',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ClaimRequest' } } },
        },
        responses: {
          '200': {
            description: 'Claim transaction broadcast',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ClaimResponse' } } },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description: 'Subscription not in active state',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },

    // ── Subscription: Cancel ──────────────────────────────────────────────────
    '/subscription/cancel': {
      post: {
        tags: ['Subscription'],
        summary: 'Subscriber cancels a subscription',
        description: 'Broadcasts the cancel path of the covenant — sweeps remaining balance back to the subscriber. **Demo only**: WIF passed in body. Production should sign client-side.',
        operationId: 'cancelSubscription',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CancelRequest' } } },
        },
        responses: {
          '200': {
            description: 'Subscription cancelled and balance refunded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    txid: { type: 'string' },
                    refundedSats: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Subscription: Verify (issue JWT) ──────────────────────────────────────
    '/subscription/verify': {
      get: {
        tags: ['Subscription'],
        summary: 'Issue a subscription access JWT',
        description: 'Returns a signed JWT for an active subscription. Provide the token category via `X-Subscription-Token` header or `?tokenCategory=` query param.',
        operationId: 'verifySubscription',
        parameters: [
          {
            name: 'tokenCategory',
            in: 'query',
            required: false,
            description: 'CashToken category hex (alternative to header)',
            schema: { type: 'string' },
          },
          {
            name: 'X-Subscription-Token',
            in: 'header',
            required: false,
            description: 'CashToken category hex',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Subscription JWT issued',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/AccessToken' },
                    {
                      type: 'object',
                      properties: { tokenCategory: { type: 'string' } },
                    },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '402': { $ref: '#/components/responses/PaymentRequired' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ── Webhook: Tx Confirmed ─────────────────────────────────────────────────
    '/webhook/tx-confirmed': {
      post: {
        tags: ['Webhook'],
        summary: 'Notify server of a confirmed transaction',
        description: 'Called by a block explorer, Chaingraph, or monitoring service when a relevant tx is confirmed. Requires `X-Webhook-Secret` header.',
        operationId: 'webhookTxConfirmed',
        security: [],
        parameters: [
          {
            name: 'X-Webhook-Secret',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookTxConfirmedRequest' } } },
        },
        responses: {
          '200': {
            description: 'Processed',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Webhook: Block ────────────────────────────────────────────────────────
    '/webhook/block': {
      post: {
        tags: ['Webhook'],
        summary: 'Notify server of a new block',
        description: 'Called when a new BCH block is found. Server refreshes subscription balances.',
        operationId: 'webhookBlock',
        security: [],
        parameters: [
          {
            name: 'X-Webhook-Secret',
            in: 'header',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookBlockRequest' } } },
        },
        responses: {
          '200': {
            description: 'Block processed',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Merchant ──────────────────────────────────────────────────────────────
    '/merchant/wallet-balance': {
      get: {
        tags: ['Merchant'],
        summary: 'Get the merchant\'s direct wallet balance',
        description: 'Queries the actual BCH UTXO balance of the merchantAddress.',
        operationId: 'getMerchantWalletBalance',
        responses: {
          '200': {
            description: 'Wallet balance retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    address: { type: 'string' },
                    balanceSats: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Demo: protected endpoint ──────────────────────────────────────────────
    '/api/premium/hello': {
      get: {
        tags: ['Demo'],
        summary: 'Token-gated demo endpoint (per-call)',
        description: 'Returns 402 with a payment challenge when called without a valid JWT. Pay the challenge, call POST /verify-payment, then retry with `Authorization: Bearer <token>`.',
        operationId: 'premiumHello',
        security: [{ BearerJWT: [] }, { PaymentToken: [] }],
        responses: {
          '200': {
            description: 'Authorized — greeting returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          '402': { $ref: '#/components/responses/PaymentRequired' },
        },
      },
    },

    // ── Demo: second protected endpoint ───────────────────────────────────────
    '/api/premium/data': {
      get: {
        tags: ['Demo'],
        summary: 'Token-gated demo endpoint (per-call)',
        description: 'Same as /api/premium/hello — demonstrates gating any arbitrary endpoint.',
        operationId: 'premiumData',
        security: [{ BearerJWT: [] }, { PaymentToken: [] }],
        responses: {
          '200': {
            description: 'Authorized — data returned',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '402': { $ref: '#/components/responses/PaymentRequired' },
        },
      },
    },
  },
} as const;
