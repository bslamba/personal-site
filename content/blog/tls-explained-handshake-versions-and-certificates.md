---
title: "TLS Explained: What the Handshake Does, Version by Version, and Why 1.3 Is Faster"
excerpt: "The three things TLS provides, what actually happens during the handshake, how every version from 1.0 to 1.3 differs, the three certificate types, and what Perfect Forward Secrecy really buys you."
date: "2026-01-15"
tags: ["TLS", "Security", "Certificates", "Networking", "Fundamentals"]
draft: false
---

## Cheat sheet

**TLS provides exactly three things:**

| | |
|---|---|
| **Encryption** | Hides the data being transferred from third parties |
| **Authentication** | Ensures the parties exchanging information are who they claim to be |
| **Integrity** | Verifies that the data has not been forged or tampered with |

**During the handshake, the client and server:**
- Specify which **version** of TLS they will use (1.0, 1.1, 1.2, 1.3)
- Decide on which **cipher suites** they will use
- **Authenticate** the identity of the server using the server's TLS certificate
- Generate **session keys** for encrypting messages after the handshake completes

| Version | Released | Note |
|---|---|---|
| **1.0** | January 1999 | Upgrade to SSL 3.0. Allowed downgrade to SSL 3.0 without a protocol change. |
| **1.1** | April 2006 | Added protection against CBC (Cipher Block Chaining) attacks. |
| **1.2** | 2008 | Specification of hash and algorithm by client and server; authenticated encryption with extra data modes. Can verify length based on cipher suite type — makes it much harder to relay attack messages. |
| **1.3** | Current | MD5 and SHA-224 removed. Digital signatures required for earlier configuration with key exchange methods. **Perfect Forward Secrecy** where public keys are involved. Handshake messages are now encrypted. |

**Certificate types:** Domain Validation (DV) · Organization Validation (OV) · Extended Validation (EV)

**TLS 1.3 is faster** — fewer round trips. **0-RTT** lets a returning client send data on the first message using a pre-shared key.

---

TLS is the protocol underneath every `https://` on the internet, every EAP-TLS authentication on your network, and every secure API call your infrastructure makes. Understanding it properly pays off across all three.

## The three guarantees

There are three main components to what the TLS protocol accomplishes:

**Encryption** — hides the data being transferred from third parties. This is what most people think TLS is entirely about.

**Authentication** — ensures the parties exchanging information are who they claim to be. This is arguably more important than encryption. Encrypting a conversation with an attacker is not a security win.

**Integrity** — verifies that the data has not been forged or tampered with. Without it, an attacker who can't read your traffic could still modify it in transit.

All three matter. A protocol with encryption but no authentication is vulnerable to a man in the middle; one with encryption but no integrity is vulnerable to manipulation.

## What happens in the handshake

During the TLS handshake, the user's device and the web server accomplish four things:

**1. Specify which version of TLS will be used.** The client offers what it supports; the server picks. This negotiation is where downgrade attacks historically lived.

**2. Decide which cipher suites will be used.** A cipher suite specifies the key exchange algorithm, the bulk encryption cipher, and the message authentication code. Both sides must support the chosen suite.

**3. Authenticate the identity of the server using the server's TLS certificate.** The server presents its certificate; the client validates it against its trust store, checks the name matches, checks the dates, and checks revocation.

**4. Generate session keys** for encrypting messages between them after the handshake completes.

That last point is the crucial architectural detail. The certificate's asymmetric keys are used only to establish trust and agree on secrets. The actual data is encrypted with **symmetric** session keys, because symmetric encryption is enormously faster.

## The protocols inside TLS

TLS isn't one thing. It sits between the application and transport layers and is made of several sub-protocols:

**Handshake Protocol** — negotiation and key establishment.
**ChangeCipherSpec Protocol** — the signal that everything after this point is encrypted with the newly agreed keys.
**Alert Protocol** — error and warning messages, including the close notification.
**Record Protocol** — the layer that actually carries everything else, handling fragmentation, compression, MAC and encryption.

The Record Protocol sits beneath the other three. Everything, including handshake messages, is carried within records.

## Version by version

### TLS 1.0 — January 1999

An upgrade to SSL 3.0. Its notable weakness: it **allowed connection downgrade to SSL 3.0 without the need for a protocol change**. That made downgrade attacks straightforward, and it's a large part of why 1.0 is now disabled everywhere.

### TLS 1.1 — April 2006

Updated 1.0 and added **protection against CBC (Cipher Block Chaining) attacks** — specifically by using explicit initialisation vectors rather than the predictable chained ones that made BEAST possible.

### TLS 1.2 — 2008

The significant one, and still widely deployed.

It allows **specification of the hash and algorithm used by both client and server**, rather than the hard-coded MD5/SHA-1 combination of earlier versions. It added **authenticated encryption with additional data (AEAD)** modes, which combine confidentiality and integrity in one operation.

It also **verifies length based on cipher suite type**, which makes it much harder to relay attack messages, because messages that aren't correctly formatted are rejected.

### TLS 1.3 — current

A genuine redesign rather than an increment.

**MD5 and SHA-224 support is removed.** So are static RSA key exchange, custom Diffie-Hellman groups, compression, and renegotiation — a long list of things that had been the root of specific attacks.

**Digital signatures are required** for earlier configurations with key exchange methods.

**Perfect Forward Secrecy** in every case where public keys are involved.

**Handshake messages are now encrypted**, which was not true before. In TLS 1.2 an observer could see the certificate and much of the negotiation in plaintext.

## Why 1.3 is faster

TLS 1.3 removes a full round trip from the handshake.

**TLS 1.2 full handshake:** two round trips before application data can flow. ClientHello, ServerHello with certificate, then ClientKeyExchange, ChangeCipherSpec, Finished, then the server's ChangeCipherSpec and Finished.

**TLS 1.3 full handshake:** one round trip. The client guesses the key exchange parameters and sends its key share with the ClientHello, so the server can respond with everything needed.

On a connection with 100 ms latency, that's 100 ms saved on every new connection. Across a page loading resources from several origins, it's noticeable.

### Zero Round-Trip Time (0-RTT)

TLS 1.3's most aggressive optimisation.

As with SSL, TLS relies on key exchanges to establish a secure session. In earlier versions, keys could be exchanged during the handshake using one of two mechanisms: a **static RSA key**, or a **Diffie-Hellman key**. In TLS 1.3, RSA has been removed, along with all static (non-PFS) key exchanges — while retaining ephemeral Diffie-Hellman keys.

In addition to eliminating the security risk posed by a static key, which can compromise security if accessed illicitly, relying exclusively on Diffie-Hellman allows the client to send the requisite randoms and inputs needed for key generation during its "hello", **eliminating one round-trip on the handshake**.

This saves time and improves overall performance. In addition, when accessing a site that has been visited previously, a client can send data on the *first* message to the server by leveraging a **pre-shared key (PSK)** from the prior session — hence "zero round-trip time" (0-RTT).

**The caveat, worth stating:** 0-RTT data is vulnerable to replay attacks, because it isn't protected by a fresh handshake. It should only be used for idempotent requests. Sending a payment instruction in 0-RTT data is a genuinely bad idea.

## Perfect Forward Secrecy

By creating a **unique session key for each transaction** instead of relying on sessions to keep connections open, attackers can't gain access to data from more than a single communication between a server and a user.

The benefit is increased security for both the user and the organisation running the server — but it's **not a perfect system in spite of what its name implies**.

The concrete scenario it protects against: an attacker records your encrypted traffic today, and obtains the server's private key in two years. Without PFS, that private key decrypts every recorded session retrospectively. With PFS, each session used an ephemeral key that no longer exists anywhere, so the recording stays useless.

This is why ephemeral Diffie-Hellman (DHE, ECDHE) matters and static RSA key exchange was removed in TLS 1.3.

## The three certificate types

There are three types of SSL/TLS certificate, differing entirely in what the CA verified before issuing:

**Domain Validation (DV)** — proves control of the domain name, and nothing else. Automated, free from Let's Encrypt, issued in seconds. Encryption is identical to the other types.

**Organization Validation (OV)** — the CA also verifies the organisation exists and is legitimate. Takes days and costs money. The organisation name appears in the certificate details.

**Extended Validation (EV)** — the most stringent verification, involving legal existence, physical address and operational status. Once produced the green address bar in browsers; browsers have largely removed that distinction, which undercut much of the commercial argument.

**Practically:** the encryption is the same across all three. What differs is what a human can learn from inspecting the certificate. For most purposes DV is sufficient, which is why Let's Encrypt changed the industry.

**The exception worth knowing:** captive portals and any service that guests will encounter should use a publicly trusted certificate — of any type — rather than an internal CA. Guest devices don't trust your internal PKI, and a certificate warning at the point of first contact is a poor introduction.

## Where TLS meets network access control

**EAP-TLS** is the strongest 802.1X method precisely because it uses mutual TLS authentication — both the endpoint and the server present certificates. The client validates the server's certificate, which prevents rogue-RADIUS attacks, and the server validates the client's, which is the actual authentication.

That mutual validation is why EAP-TLS deployments live or die on trust store hygiene. A missing intermediate CA on either side produces a failure that looks identical to an expired certificate.

**PEAP** by contrast builds a TLS tunnel first — validating only the server's certificate — and then carries a password-based method inside it. Weaker, because the credential is still a password, but far easier to deploy.

## Practical checks

```bash
# What the server actually presents
openssl s_client -connect example.com:443 -servername example.com

# Which versions are accepted
openssl s_client -connect example.com:443 -tls1_2
openssl s_client -connect example.com:443 -tls1_3

# Certificate dates and subject
echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates -subject -issuer

# Verify the chain
openssl s_client -connect example.com:443 -showcerts
```

`-showcerts` is the one for chain problems. If the server isn't sending its intermediate certificate, some clients will work — because they've cached the intermediate — and others will fail. That inconsistency is the signature of a missing intermediate, and it's one of the most common TLS misconfigurations in production.

---

TLS gives you encryption, authentication and integrity. Most deployment failures are in the second one — a certificate that isn't trusted, a name that doesn't match, a chain that's incomplete. Encryption almost always works. It's proving who you're talking to that goes wrong.
