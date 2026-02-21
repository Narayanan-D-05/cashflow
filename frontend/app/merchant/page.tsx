import Header from "@/components/header";
import Footer from "@/components/footer";
import CursorGlow from "@/components/cursor-glow";
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Zap, Shield, Code, Server, Wallet } from 'lucide-react';

export default function MerchantDoc() {
    return (
        <div className="relative min-h-screen flex flex-col font-sans text-white bg-[var(--color-bg)]">
            <CursorGlow />
            <Header />

            <main className="flex-1 flex w-full max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-16 gap-8">

                {/* Left Sidebar Navigation */}
                <aside className="hidden lg:block w-64 shrink-0">
                    <div className="sticky top-24 space-y-6">
                        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-white transition-colors mb-4">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Home
                        </Link>

                        <nav className="space-y-1">
                            <p className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wider uppercase mb-3">Getting Started</p>
                            <a href="#overview" className="block py-1.5 text-sm text-white font-medium hover:text-[var(--color-brand)] transition-colors">Overview</a>
                            <a href="#why" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Why CashFlow402?</a>
                            <a href="#how-it-works" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">How It Works</a>

                            <p className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wider uppercase mt-8 mb-3">Integration Guide</p>
                            <a href="#setup" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Wallet & Network</a>
                            <a href="#plans" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Configuring Plans</a>
                            <a href="#router402" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Router402 Middleware</a>
                            <a href="#claims" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Batch Claims</a>

                            <p className="text-xs font-semibold text-[var(--color-text-muted)] tracking-wider uppercase mt-8 mb-3">Management</p>
                            <a href="#security" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Security & JWT</a>
                            <a href="#revenue" className="block py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Revenue & Fees</a>
                        </nav>
                    </div>
                </aside>

                {/* Content Area */}
                <article className="flex-1 min-w-0 max-w-3xl space-y-12 animate-fade-in-up">

                    <section id="overview" className="space-y-4">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold uppercase tracking-widest text-[var(--color-brand)] bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/20 rounded-full mb-4">
                            <Code className="w-3.5 h-3.5" /> Merchant Guide
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold font-[var(--font-space-grotesk)] text-gradient tracking-tight">
                            Integrating CashFlow402
                        </h1>
                        <p className="text-lg text-[var(--color-text-muted)] leading-relaxed">
                            This guide is for AI developers, SaaS founders, and creators who want to accept native, instant, and frictionless crypto micropayments using HTTP 402 and Bitcoin Cash (BCH). No deep blockchain experience is required.
                        </p>
                    </section>

                    <section id="why" className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-[var(--color-border)] pb-2">Why CashFlow402?</h2>

                        <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-faint)] uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Feature</th>
                                        <th className="px-6 py-4 font-semibold">Traditional (Stripe)</th>
                                        <th className="px-6 py-4 font-semibold text-[var(--color-brand)]">CashFlow402</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-border)]">
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium">Transaction Fee</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)]">2.9% + $0.30</td>
                                        <td className="px-6 py-4 text-white font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[var(--color-brand)]" />Fraction of a cent</td>
                                    </tr>
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium">Chargebacks</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)]">Yes (High risk)</td>
                                        <td className="px-6 py-4 text-white font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[var(--color-brand)]" />None (Immutable)</td>
                                    </tr>
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium">Micro-Tx Usability</td>
                                        <td className="px-6 py-4 text-red-400">Unprofitable &lt; $1.00</td>
                                        <td className="px-6 py-4 text-[var(--color-brand)] font-bold flex items-center gap-2"><Zap className="w-4 h-4" />Profitable &lt; $0.001</td>
                                    </tr>
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium">Settlement</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)]">2–7 business days</td>
                                        <td className="px-6 py-4 text-white font-semibold">Instant (On-chain)</td>
                                    </tr>
                                    <tr className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium">Privacy</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)]">Full PII required</td>
                                        <td className="px-6 py-4 text-white font-semibold">Wallet Address Only</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-[var(--color-brand)]/5 border border-[var(--color-brand)]/20 p-5 rounded-xl">
                            <h3 className="text-[var(--color-brand)] font-bold mb-2">Who is this for?</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--color-text-muted)]">
                                <li><strong className="text-white">AI Agents &amp; LLMs:</strong> Charge exact fractions of a cent per prompt or per inference chunk.</li>
                                <li><strong className="text-white">Crypto APIs:</strong> Rate-limit and monetize endpoints without asking for credit cards.</li>
                                <li><strong className="text-white">Paywall Content:</strong> Let users read articles or stream video securely.</li>
                            </ul>
                        </div>
                    </section>

                    <section id="how-it-works" className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-[var(--color-border)] pb-2">How It Works</h2>

                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-brand)]/50 transition-colors">
                                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-black flex items-center justify-center text-xs">1</span>
                                    The Subscriber
                                </h3>
                                <p className="text-sm text-[var(--color-text-muted)] space-y-2">
                                    They visit your site and create a local session. They fund a unique temporary address with a small amount of BCH (e.g. $2.00).
                                    <br /><br />
                                    A smart contract (covenant) and a CashToken NFT are minted. They get instant, frictionless access to your API without needing wallet popups for every single click.
                                </p>
                            </div>

                            <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-brand)]/50 transition-colors">
                                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-black flex items-center justify-center text-xs">2</span>
                                    The Merchant
                                </h3>
                                <p className="text-sm text-[var(--color-text-muted)] space-y-2">
                                    Instead of tracking thousands of micro-transactions, you rely on the HTTP 402 middleware to track their off-chain satoshi spend.
                                    <br /><br />
                                    At predefined intervals (e.g. daily), your server submits one "Batch Claim" transaction, instantly pulling all earned BCH from their Smart Contracts straight to your securely unexposed wallet.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section id="setup" className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-[var(--color-border)] pb-2">Step 1: Get a Merchant Wallet</h2>
                        <p className="text-[var(--color-text-muted)] text-sm">
                            You need a Bitcoin Cash (BCH) wallet address to receive payments. When deploying the server, this is controlled entirely by a private WIF (Wallet Import Format) string in your environment variables.
                        </p>
                        <div className="p-4 bg-black/50 border border-[var(--color-border)] rounded-xl font-mono text-xs text-[#00ffcc] overflow-x-auto">
                            <span className="text-gray-500"># .env configuration</span><br />
                            BCH_NETWORK=chipnet<br />
                            MERCHANT_WIF=cRYPToR4Nd0mS3cr3TK3y...<br />
                        </div>
                        <p className="text-sm text-yellow-500/80 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                            <Shield className="inline-block w-4 h-4 mr-2 -mt-1" />
                            <strong>Crucial:</strong> All payments are settled securely to the address derived from this key. Keep your WIF completely offline and hidden in server secrets.
                        </p>
                    </section>

                    <section id="router402" className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-[var(--color-border)] pb-2">Step 2: Router402 Middleware</h2>
                        <p className="text-[var(--color-text-muted)] text-sm">
                            CashFlow402 ships with an Express Node.js router that intercepts HTTP calls. When a user queries your data but hasn't paid, it responds with <code className="text-[var(--color-brand)]">HTTP 402 Payment Required</code>.
                            Once funded, they receive a JWT token. Each API call seamlessly deducts sats from their contract's tracked balance.
                        </p>
                        <div className="p-4 bg-black/50 border border-[var(--color-border)] rounded-xl font-mono text-xs text-[#00ffcc] overflow-x-auto">
                            import {'{'} router402 {'}'} from '@cashflow402/sdk';<br /><br />
                            <span className="text-gray-500">// Protect this route—costs 546 sats per ping!</span><br />
                            app.get('/api/ai/generate', router402(546), async (req, res) =&gt; {'{'}<br />
                            &nbsp;&nbsp;res.json({'{'} data: "Here is your premium generated text." {'}'});<br />
                            {'}'});
                        </div>
                    </section>

                    <section id="claims" className="space-y-6">
                        <h2 className="text-2xl font-bold text-white border-b border-[var(--color-border)] pb-2">Step 3: Batch Claims</h2>
                        <p className="text-[var(--color-text-muted)] text-sm">
                            You don't need massive infrastructure. The CashFlow402 smart contract inherently verifies the time intervals mathematically on the blockchain. Triggering the Claim engine is a simple API post.
                        </p>
                        <div className="flex bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-1 rounded-lg inline-flex mb-2">
                            <code className="px-3 py-1 text-sm font-mono text-purple-400">POST /merchant/claim-all</code>
                        </div>
                        <p className="text-[var(--color-text-muted)] text-sm">
                            The backend will automatically iterate through all active user contracts, sign the required transactions, verify the mutable CashTokens, and extract your earned BCH directly to your merchant wallet.
                        </p>
                    </section>

                    <section id="security" className="space-y-6 pb-24">
                        <h2 className="text-2xl font-bold text-white border-b border-[var(--color-border)] pb-2">Security & Privacy</h2>

                        <div className="space-y-4">
                            <div className="p-5 border border-[var(--color-border)] rounded-xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg)]">
                                <h4 className="font-bold flex items-center gap-2 mb-2"><Server className="w-4 h-4 text-[var(--color-brand)]" /> Stateless JWT Auth</h4>
                                <p className="text-sm text-[var(--color-text-muted)]">
                                    Instead of forcing the user to cryptographically sign every single API call externally with MetaMask/Paytaca (which ruins UX),
                                    CashFlow issuing a time-limited verifiable JWT allows millisecond latency for heavy API usage.
                                </p>
                            </div>

                            <div className="p-5 border border-[var(--color-border)] rounded-xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg)]">
                                <h4 className="font-bold flex items-center gap-2 mb-2"><Wallet className="w-4 h-4 text-[var(--color-brand)]" /> Non-Custodial Covenants</h4>
                                <p className="text-sm text-[var(--color-text-muted)]">
                                    The CashFlow402 Smart Contract uses CashScript to ensure that funds can <strong>only</strong> be moved to the Merchant's predefined address, or returned to the Subscriber. It is mathematically impossible for an attacker hacking the routing server to steal the funds or redirect them elsewhere.
                                </p>
                            </div>
                        </div>
                    </section>

                </article>
            </main>

            <Footer />
        </div>
    );
}
