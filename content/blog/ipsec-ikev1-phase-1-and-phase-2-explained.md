---
title: "IPsec IKEv1 Explained: Phase 1, Phase 2 and Every Parameter That Must Match"
excerpt: "Main mode versus aggressive mode, the exact parameter list both peers must agree on, why the tunnel moves from UDP 500 to UDP 4500, and how to read a failure at each stage."
date: "2026-02-05"
tags: ["IPsec", "VPN", "IKEv1", "Security", "Networking"]
draft: false
---

## Cheat sheet

**Control plane**

| | |
|---|---|
| **Phase 1** | Always starts on **UDP 500** |
| **NAT-T** | If NAT is detected, **changes over to UDP 4500** |
| **Phase 2** | Follows up on Phase 1 — if Phase 1 finished on UDP 500, use 500; if it finished on 4500, use 4500 |
| **ESP** | IP protocol 50 — no ports, which is why NAT-T exists |
| **AH** | IP protocol 51 |

**Phase 1 modes**

| Mode | Behaviour |
|---|---|
| **Main mode** | Usually seen in **site-to-site VPN**. Three bidirectional message exchanges (six unidirectional). **Identity is encrypted.** |
| **Aggressive mode** | Usually seen in **remote-access VPN**. Three unidirectional messages. **Last message is encrypted** — the first two are not. |

**Phase 1 parameters that must match**

| Parameter | Options |
|---|---|
| Authentication | PSK, RSA-SIG, RSA-ENCR |
| Encryption | DES, 3DES, AES |
| Hashing | MD5, SHA-1, SHA-2 |
| DH Group | 1, 2, 5, 14, 15, 16, 17, 18 |

**Does not need to match:** SA lifetime in seconds — the common secret key lifetime is negotiated to the **lowest value** between the VPN peers.

**Phase 2 parameters that must match**

| Parameter | Options |
|---|---|
| Scope | What to protect (proxy ACL / crypto-domain) |
| Encapsulation | ESP or AH |
| Encryption | NULL, DES, 3DES, AES-CBC, AES-GCM, AES-GMAC |
| Hashing | MD5, SHA-1, SHA-2 |
| Tunnel mode | Tunnel or Transport, with or without UDP |

**PFS (Perfect Forward Secrecy)** — two additional keys derived from Phase 1 keying material. Unless PFS is enabled, **these two keys are used to encrypt data through the IPsec tunnel**.

**Lower values initiate.** Lower lifetime values and end-height values initiate the tunnel.

---

IPsec is two negotiations, not one. Understanding which is which explains almost every tunnel that fails to come up, because the failure point tells you exactly which set of parameters to compare.

## The two phases, and why there are two

**Phase 1** builds a secure management channel between the peers. Its only job is to authenticate the peers and establish a protected path for the second negotiation.

**Phase 2** uses that protected channel to negotiate the actual data tunnel — what traffic is protected, and how.

The separation is deliberate. Phase 1 is expensive (asymmetric cryptography, Diffie-Hellman) and happens rarely. Phase 2 is cheap and rekeys frequently. Without the split, every rekey would repeat the expensive work.

## Phase 1: Main mode versus Aggressive mode

**Main mode** is usually seen in **site-to-site VPNs**. It uses three bidirectional message exchanges — six unidirectional messages.

Its defining property: **identity is encrypted**. Peer identities are exchanged after the Diffie-Hellman key agreement, so an observer can't determine who is talking.

**Aggressive mode** is usually seen in **remote-access VPNs**. It uses three unidirectional messages.

Its trade-off: **only the last message is encrypted**. The first two, including identity information, are in the clear.

**Why aggressive mode exists at all:** it's faster, and it works when the initiator's IP address isn't known in advance. That's exactly the remote-access case — a user connecting from an arbitrary address can't be identified by IP, so identity must be sent early, before a key is established.

**The security consequence:** aggressive mode with pre-shared keys exposes a hash that can be captured and attacked offline. If you must use aggressive mode, use certificates rather than PSK.

## Phase 1 parameters — all must match

Both peers must agree on every one of these, or the negotiation fails:

**Authentication** — how the peers prove identity.
- **PSK** — pre-shared key. Simple, doesn't scale, and vulnerable in aggressive mode.
- **RSA-SIG** — digital signatures with certificates. The right answer at scale.
- **RSA-ENCR** — RSA encrypted nonces. Rarely used.

**Encryption** — DES, 3DES, AES. DES is broken and 3DES is deprecated; AES is the only sensible choice on anything modern.

**Hashing** — MD5, SHA-1, SHA-2. MD5 and SHA-1 are both weak. Use SHA-2.

**DH Group** — the Diffie-Hellman group determining key strength: 1, 2, 5, 14, 15, 16, 17, 18. Groups 1 and 2 are too small for modern use. Group 14 (2048-bit) is a reasonable minimum; 19–21 (elliptic curve) are better where supported.

### The parameter that does *not* need to match

**SA lifetime in seconds.** The common secret key lifetime is negotiated: the peers agree on the **lowest value** offered between them.

This catches people out. A mismatch here doesn't fail the tunnel — it just means one side's configured lifetime is ignored. If you're troubleshooting unexpected rekey intervals, this is why.

## Phase 2: what gets protected, and how

**Scope** — negotiate the scope of the IPsec tunnel: what to protect, and how to protect it. This is the proxy ACL or crypto-domain, and it is the single most common source of Phase 2 failure.

Both sides must define **mirrored** traffic selectors. If site A protects `10.1.0.0/16 → 10.2.0.0/16`, site B must protect `10.2.0.0/16 → 10.1.0.0/16` exactly. A subnet mask that differs by one bit produces a proxy ID mismatch, and the error message rarely says so clearly.

**Encapsulation** — ESP or AH.
- **ESP** (protocol 50) provides encryption and integrity. This is what you want.
- **AH** (protocol 51) provides integrity only, no encryption, and doesn't survive NAT. Effectively obsolete.

**Encryption** — NULL, DES, 3DES, AES-CBC, AES-GCM, AES-GMAC.
- **AES-GCM** is the modern choice: authenticated encryption in one operation, and considerably faster on hardware with AES instructions.
- **NULL** means no encryption — integrity only. Occasionally used where confidentiality is provided elsewhere.

**Hashing** — MD5, SHA-1, SHA-2. Not required with AES-GCM, which provides integrity itself.

**Tunnel mode** — Tunnel or Transport, with or without UDP.
- **Tunnel mode** encapsulates the entire original IP packet in a new one. Standard for site-to-site.
- **Transport mode** protects only the payload, keeping the original IP header. Used where the peers are the endpoints themselves.

## Perfect Forward Secrecy in Phase 2

**Two additional keys are derived from Phase 1 keying material.** Unless PFS is enabled, **these two keys are used to encrypt data through the IPsec tunnel**.

With PFS enabled, Phase 2 performs its own Diffie-Hellman exchange, generating keys independent of Phase 1.

**Why it matters:** without PFS, compromising the Phase 1 keying material compromises every Phase 2 SA derived from it — including past ones, if the traffic was recorded. With PFS, each Phase 2 SA has independent keys, so a compromise is contained.

The cost is CPU on every rekey. On modern hardware this is negligible relative to the benefit.

## The control plane and NAT traversal

**Phase 1 always starts on UDP 500.**

During negotiation, the peers detect whether NAT exists between them. **If NAT is detected, the conversation changes over to UDP 4500** — NAT Traversal.

**Phase 2 follows Phase 1.** If Phase 1 finished on UDP 500, Phase 2 uses UDP 500. If Phase 1 finished on UDP 4500, Phase 2 uses UDP 4500.

### Why NAT-T is necessary

**ESP is IP protocol 50 and has no port numbers.**

A NAT device translates addresses and *ports*. With no ports to work with, it has nothing to build a translation table entry from. Multiple internal hosts behind one public address become indistinguishable, and the NAT device generally drops the traffic or mangles it.

NAT-T solves this by encapsulating ESP inside UDP 4500. Now there are ports, so NAT works normally.

**The firewall consequence:** permitting UDP 500 alone is not sufficient when NAT is anywhere in the path. You need UDP 500, UDP 4500, and ideally IP protocol 50 for the non-NAT case. A tunnel that establishes Phase 1 and then fails Phase 2 is very often UDP 4500 being blocked.

## Which side initiates

**Lower values initiate.** Lower lifetime values and lower end-height values initiate the tunnel.

Practically: the peer with the shorter configured lifetime will be the one that starts rekeying. Useful to know when you're trying to work out which side's logs to read first.

## Troubleshooting by failure point

The two-phase structure makes this straightforward — where it fails tells you what to compare.

**Nothing happens at all.** UDP 500 isn't reaching the peer. Check routing, check the firewall, confirm the peer address.

**Phase 1 fails.** Compare the four Phase 1 parameters: authentication method, encryption, hash, DH group. Also check the pre-shared key on both sides — a mismatched PSK in main mode fails at message five with an authentication error rather than an obvious "wrong key" message.

**Phase 1 completes, Phase 2 fails.** Almost always the traffic selectors. Compare the proxy ACLs and confirm they mirror exactly. Second candidate: a Phase 2 transform set mismatch. Third: UDP 4500 blocked when NAT-T is required.

**Both phases complete, no traffic passes.** Routing — traffic isn't being directed into the tunnel. Or the proxy ACL doesn't actually match the traffic you're testing with. Or an ACL elsewhere is dropping the decrypted traffic after it emerges.

**Tunnel establishes then drops periodically.** Rekey failure, or dead peer detection timing out. Check whether the drop interval matches a configured lifetime.

**On Cisco IOS:**

```
show crypto isakmp sa
show crypto ipsec sa
debug crypto isakmp
debug crypto ipsec
```

`show crypto isakmp sa` in state `QM_IDLE` means Phase 1 is up. If Phase 1 is up and `show crypto ipsec sa` shows no SAs or zero encrypted packets, you're looking at a Phase 2 or routing problem, and you can ignore everything about authentication.

---

Two negotiations, two parameter sets, two ports. Establish which phase failed first and the troubleshooting narrows immediately — there's no point comparing transform sets when the peers never authenticated.
