const fs = require('fs');
let c = fs.readFileSync('frontend/app/subscription/page.tsx', 'utf-8');

const injectLine = c.indexOf('// ─────────────────────────────────────────────────────────────────────────');
c = c.substring(0, injectLine) + 'const activeStepId = s3 === "done" ? 4 : session ? 2 : 1;\n    ' + c.substring(injectLine);

const s1Start = c.indexOf('<div className="flex flex-col gap-4 animate-fade-in-up delay-100">');
const s1End = c.indexOf('                    {/* ── Legend ─────────────────────────────────────────────────────── */}');
if (s1Start !== -1 && s1End !== -1) {
    const newUI = `
                    {/* ── STEPPER WIZARD ─────────────────────────────────────────────── */}
                    <div className="flex flex-col animate-fade-in-up delay-100 mb-8">
                        <div className="flex items-center gap-2 sm:gap-4 justify-between sm:justify-center overflow-x-auto pb-4 px-2 no-scrollbar">
                            {[
                                { step: 1, label: "Create Session", icon: Key, isDone: !!session },
                                { step: 2, label: "Fund Address", icon: Wallet, isDone: !!fundData || s3 === "done" },
                                { step: 3, label: "Auto-Fund", icon: ArrowDown, isDone: s3 === "done" }
                            ].map((item, idx, arr) => {
                                const isActive = activeStepId === item.step || (activeStepId === 4 && item.step === 3);
                                return (
                                    <div key={item.step} className="flex items-center gap-2 sm:gap-4 shrink-0">
                                        <div className={\`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border transition-all \${isActive ? 'bg-[var(--color-brand)]/10 border-[var(--color-brand)] text-[var(--color-brand)] glow-sm' : item.isDone ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)]' : 'border-[var(--glass-border)] text-[var(--color-text-faint)]'}\`}> 
                                            {item.isDone && !isActive ? <CheckCircle2 className="w-4 h-4" /> : <item.icon className="w-4 h-4" />}
                                            <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">{item.label}</span>
                                        </div>
                                        {idx < arr.length - 1 && (
                                            <div className={\`h-px w-6 sm:w-10 \${item.isDone ? 'bg-[var(--color-success)]/30' : 'bg-[var(--glass-border)]'}\`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── ACTIVE STEP CONTENT ─────────────────────────────────────────────── */}
                    <div className="glass rounded-2xl p-6 sm:p-8 border border-[var(--glass-border)] animate-fade-in-up delay-150 transition-all mb-8 shadow-xl relative overflow-hidden">
                        {/* Background subtle glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-[var(--color-brand)]/5 blur-[50px] pointer-events-none rounded-full"></div>

                        {(!session) && (
                            <div className="flex flex-col gap-5 animate-fade-in relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--color-brand)]/10 flex items-center justify-center border border-[var(--color-brand)]/20">
                                        <Key className="w-5 h-5 text-[var(--color-brand)]" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-[var(--color-text)]">Create Session (Local Wallet)</h3>
                                        <p className="text-sm text-[var(--color-text-faint)] mt-0.5">POST /subscription/create-session</p>
                                    </div>
                                </div>
                                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                                    This auto-generates a disposable subscriber keypair and deploys a unique "Covenant" Smart Contract onto Bitcoin Cash. 
                                </p>
                                <button
                                    onClick={runStep1}
                                    disabled={s1 === "running"}
                                    className="w-fit flex items-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold
                                    bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                                    hover:bg-[var(--color-brand-light)] disabled:opacity-40
                                    transition-all duration-200 glow-sm hover:glow-md mt-2"
                                >
                                    {s1 === "running" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                                    {s1 === "running" ? "Deploying Covenant..." : "Create Session"}
                                </button>
                            </div>
                        )}

                        {session && s3 !== "done" && (
                            <div className="flex flex-col gap-6 animate-fade-in relative z-10">
                                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[var(--glass-border)] pb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20">
                                            <Wallet className="w-5 h-5 text-[var(--color-success)]" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-xl text-[var(--color-text)]">Fund & Auto-Fund</h3>
                                            <p className="text-sm text-[var(--color-text-faint)] mt-0.5">Fund your newly deployed covenant lockbox.</p>
                                        </div>
                                    </div>
                                    <button onClick={clearSession} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] underline transition-colors px-2">
                                        Clear Wallet & Start Over
                                    </button>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <MonoRow label="Subscriber Address (Fund This)" value={session.subscriberAddress} />
                                    <MonoRow label="Contract Address" value={session.contractAddress} dimValue />
                                    
                                    <div className="grid grid-cols-3 gap-3 text-center mt-2">
                                        {[
                                            { label: "Deposit Required", value: \`\${(session.depositSats ?? 0).toLocaleString()} sats\` },
                                            { label: "Max Claimable", value: \`\${(session.maxSats ?? session.authorizedSats ?? 0).toLocaleString()} sats\` },
                                            { label: "Claim Interval", value: \`\${session.intervalBlocks} blocks\` },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="bg-[var(--color-surface-alt)]/50 rounded-xl p-3 border border-[var(--glass-border)]">
                                                <p className="text-[9px] uppercase tracking-widest text-[var(--color-text-faint)]">{label}</p>
                                                <p className="text-sm font-bold font-mono text-[var(--color-brand)] mt-1">{value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/20 mt-2">
                                        <Zap className="w-5 h-5 text-[var(--color-brand)] shrink-0 mt-0.5" />
                                        <div className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                                            Send exactly <span className="text-[var(--color-brand)] font-bold font-mono">\${(session.depositSats + 1500).toLocaleString()} sats</span> to the Subscriber Address. 
                                            Once funded, click the Auto-Fund button below to broadcast the initial NFT state.
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-3 items-center mt-2">
                                        <a
                                            href={\`\${session.subscriberAddress}?amount=\${(session.depositSats + 1500) / 100000000}\`}
                                            className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold
                                                bg-[#00c58e] text-black shadow-[0_0_15px_rgba(0,197,142,0.3)]
                                                hover:bg-[#00db9d] hover:shadow-[0_0_20px_rgba(0,197,142,0.5)] transition-all shrink-0"
                                        >
                                            <Wallet className="w-4 h-4" /> Pay with Paytaca
                                        </a>
                                        <span className="text-xs uppercase text-[var(--color-text-muted)] font-bold px-2">OR</span>
                                        <a
                                            href="https://tbch.googol.cash"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold
                                    border border-[var(--color-brand)]/40 text-[var(--color-brand)]
                                    hover:bg-[var(--color-brand)]/10 transition-all shrink-0"
                                        >
                                            <ExternalLink className="w-4 h-4" /> tbch.googol.cash faucet
                                        </a>
                                    </div>

                                    <div className="border-t border-[var(--glass-border)] mt-4 pt-6">
                                        <button
                                            onClick={runStep3}
                                            disabled={s3 === "running"}
                                            className="w-full flex justify-center items-center gap-2 py-3.5 px-6 rounded-xl text-base font-bold
                                bg-[var(--color-brand)] text-[oklch(0.12_0.01_85)]
                                hover:bg-[var(--color-brand-light)] disabled:opacity-40
                                transition-all duration-200 glow-sm hover:glow-md"
                                        >
                                            {s3 === "running" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowDown className="w-5 h-5" />}
                                            {s3 === "running" ? "Broadcasting Genesis Tx..." : "Auto-Fund Contract On-Chain"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(s3 === "done" && activeStepId >= 3) && (
                            <div className="flex flex-col gap-6 animate-fade-in relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20">
                                        <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-[var(--color-text)]">Subscription Active</h3>
                                        <p className="text-sm text-[var(--color-text-faint)] mt-0.5">Ready to use the AI Agent</p>
                                    </div>
                                </div>

                                {fundData && (
                                    <div className="flex flex-col gap-4 border border-[var(--glass-border)] p-5 rounded-xl bg-[var(--color-surface-alt)]/20">
                                        <MonoRow label="Genesis TxID" value={fundData.txid} />
                                        <MonoRow label="Subscription NFT Category" value={fundData.tokenCategory} />
                                        
                                        <div className="flex gap-3 mt-2 flex-wrap">
                                            <a
                                                href={\`https://chipnet.imaginary.cash/tx/\${fundData.txid}\`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold
                                border border-[var(--color-border)] text-[var(--color-text-muted)]
                                hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                                            >
                                                <ExternalLink className="w-4 h-4" /> View on Explorer
                                            </a>
                                            {callbackUrl && (
                                                <a
                                                    href={\`\${callbackUrl}?tokenCategory=\${fundData.tokenCategory}\`}
                                                    className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl text-sm font-bold
                                                    bg-[#3b82f6] text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] 
                                                    hover:bg-[#60a5fa] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all"
                                                >
                                                    <Zap className="w-4 h-4" /> Continue to Merchant App
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-[var(--glass-border)] pt-6 mt-2">
                                    {cancelData ? (
                                        <div className="flex flex-col gap-4 p-5 rounded-xl border border-green-500/30 bg-green-950/20">
                                            <div className="flex items-center gap-2 text-green-400 font-bold mb-1">
                                                ✅ Refunded {cancelData.refundedSats} sats successfully!
                                            </div>
                                            <MonoRow label="Refund TxID" value={cancelData.txid} />
                                            <div className="flex gap-3 mt-2">
                                                <a
                                                        href={\`https://chipnet.imaginary.cash/tx/\${cancelData.txid}\`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold
                                                        border border-[var(--color-border)] text-[var(--color-text-muted)]
                                                        hover:border-green-400 hover:text-green-400 transition-all"
                                                    >
                                                        <ExternalLink className="w-4 h-4" /> View Refund
                                                </a>
                                                <button
                                                        onClick={clearSession}
                                                        className="flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold
                                                        border border-[var(--color-border)] text-[var(--color-text-muted)]
                                                        hover:border-[var(--color-brand)]/40 hover:text-[var(--color-brand)] transition-all"
                                                >
                                                        🔄 Start Over
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <p className="text-sm text-[var(--color-text-muted)] mb-1">
                                                Finished with the service? You can safely withdraw your unused balance.
                                            </p>
                                            {confirmWithdraw ? (
                                                <div className="flex flex-col gap-3 p-4 rounded-xl border border-red-500/40 bg-red-950/20 animate-fade-in">
                                                    <p className="text-sm text-red-400 font-bold mb-1">
                                                        ⚠️ Warning: This burns your active subscription NFT and returns remaining funds.
                                                    </p>
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={runCancel}
                                                            disabled={sCancelStatus === "running"}
                                                            className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold
                                                            bg-red-600 text-white hover:bg-red-500
                                                            disabled:opacity-40 transition-all"
                                                        >
                                                            {sCancelStatus === "running" ? <><Loader2 className="w-4 h-4 animate-spin" /> Canceling...</> : <>✅ Yes, Withdraw Funds</>}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmWithdraw(false)}
                                                            className="py-2.5 px-5 rounded-xl text-sm font-semibold
                                                            border border-[var(--glass-border)] text-[var(--color-text-muted)]
                                                            hover:border-white transition-all"
                                                        >
                                                            Nevermind
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmWithdraw(true)}
                                                    className="w-fit flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold
                                                    bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white
                                                    border border-red-500/30 transition-all duration-200"
                                                >
                                                    💸 Withdraw Remaining Balance
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
`;
    c = c.substring(0, s1Start) + newUI + c.substring(s1End);
    fs.writeFileSync('frontend/app/subscription/page.tsx', c);
    console.log('Success UI replaced!');
} else {
    console.log('Error bounds');
}
