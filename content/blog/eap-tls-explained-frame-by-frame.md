---
title: "EAP-TLS Explained Frame by Frame: The Full 802.1X Certificate Exchange"
excerpt: "Every message in an EAP-TLS authentication, what each one carries, why the certificate frames fragment across multiple EAP rounds, and how to read the exchange in a packet capture when it fails."
date: "2026-07-02"
tags: ["EAP-TLS", "802.1X", "Cisco ISE", "RADIUS", "Certificates", "Packet Analysis", "AAA"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Defined in** | [RFC 5216](https://datatracker.ietf.org/doc/html/rfc5216) |
| **EAP Type** | **13** |
| **Credential** | A certificate on **both** sides — mutual authentication |
| **Inner tunnel** | **None.** Unlike PEAP, EAP-TTLS and EAP-FAST, there is no second credential inside a tunnel |
| **Outer identity** | Sent in **cleartext** in the EAP-Response/Identity |
| **EAP codes** | 1 Request · 2 Response · 3 Success · 4 Failure |
| **Fragmentation** | Certificates exceed the EAP MTU, so they split across **several EAP round trips** |
| **Result** | RADIUS Access-Accept → authenticator converts to **EAP-Success** |
| **After success** | On 802.11, the **4-Way Handshake** derives the session keys |
| **Why it's strong** | No password exists to phish, replay or crack |
| **Why it's hard** | You have to run a PKI and get certificates onto every endpoint |

---

EAP-TLS is the strongest authentication method in common use on enterprise networks, and the one people find hardest to deploy. Both facts come from the same property: there is no password anywhere in the exchange.

That removes the entire category of attacks that target credentials — phishing, replay, offline cracking, credential stuffing. It also means every endpoint needs a certificate, which means you need a PKI, an enrolment process and a lifecycle. Most organisations that struggle with EAP-TLS are not struggling with 802.1X. They are struggling with certificate management.

## The three roles

Before the frames, the cast:

**Supplicant** — the software on the endpoint that speaks 802.1X.

**Authenticator** — the switch or wireless controller. It sits in the middle and, importantly, **understands almost nothing of what passes through it**. It relays EAP between the endpoint and the server, and it enforces the result.

**Authentication server** — ISE, or another RADIUS server. This is where the decision is actually made.

## The full exchange

![EAP-TLS full message exchange between supplicant, authenticator and authentication server](/blog-images/eaptls/eap-tls-message-exchange.svg)

Worth noticing the shape before the detail: the authenticator is a relay. The interesting conversation is between the endpoint and the server, and the switch is carrying it without being able to read it.

## Phase 1 — identity

### EAPOL-Start (optional)

The supplicant announces itself. Optional, because the authenticator will send an Identity Request when it detects link-up anyway. Its absence is not a fault.

### EAP-Request / Identity

The authenticator asks who this is.

### EAP-Response / Identity

The supplicant answers — and **this goes in cleartext**.

That's worth dwelling on. In tunnelled methods like PEAP, the cleartext value is an *outer* identity that can be anonymised, with the real identity protected inside the tunnel. In EAP-TLS there is no inner exchange, so whatever the supplicant puts here is visible to anyone listening.

RFC 5216 does define a **privacy mode**, where the TLS handshake is established before the identity is passed. In practice it is largely unimplemented, and most supplicants send a real identity in the clear.

**The practical consequence:** don't put anything sensitive in the outer identity. Many deployments send `anonymous` or a generic value, since the identity that actually matters is the one in the client certificate.

### RADIUS Access-Request

The authenticator wraps the EAP payload in RADIUS and forwards it. From here, the same EAP conversation is carried by two different transports on either side of the switch.

![How EAP-TLS is encapsulated across the two network segments](/blog-images/eaptls/eap-tls-encapsulation.svg)

## Phase 2 — the server proves itself

### EAP-Request / TLS Start

The server responds with an EAP packet of **Type 13 (TLS)** and **Code 1 (Request)**, with the Start bit set. This says: begin a TLS handshake.

If you're reading a capture, this frame is the marker for where EAP stops being generic and becomes EAP-TLS specifically.

### TLS Client Hello

The supplicant opens the TLS handshake. The Client Hello carries the TLS versions it supports, the cipher suites it will accept, and the client random.

Two things fail here in practice. A **version mismatch**, where the server requires TLS 1.2 or above and an older supplicant offers only 1.0. And a **cipher suite mismatch**, common when a hardened server disables weak suites that an embedded device is the only one that supports.

### Server Hello, Certificate, Certificate Request, Server Hello Done

The server responds with four TLS messages in one logical flight:

**Server Hello** — the chosen version, chosen cipher suite, server random.

**Certificate** — the server's certificate, and it should send the full chain.

**Certificate Request** — this is what makes it EAP-TLS rather than a server-only TLS session. The server is asking the client to authenticate too.

**Server Hello Done** — end of this flight.

### Why this fragments

This flight is far larger than a single EAP packet can carry. A certificate chain is easily several kilobytes; the EAP MTU is typically around 1,020 to 1,400 bytes depending on the network.

So the server splits it. Each fragment is an EAP-Request with the More Fragments bit set; the supplicant acknowledges each with an empty EAP-Response, and the exchange continues until the last fragment arrives without the flag.

**In a capture this looks like a lot of frames doing apparently nothing.** Several EAP-Request/EAP-Response pairs carrying no visible TLS content. That's normal — it's reassembly.

**This is also where two real problems show up.** A certificate chain with unnecessary intermediates increases fragment count and authentication time. And on wireless in particular, fragment loss causes the whole handshake to restart — which presents as intermittent authentication failure that correlates with poor RF rather than anything on ISE.

### What the supplicant is checking

![Mutual certificate validation in EAP-TLS](/blog-images/eaptls/eap-tls-mutual-validation.svg)

This half is the one most often left unconfigured, and it matters more than people assume.

A supplicant that doesn't validate the server certificate will happily authenticate to **any** RADIUS server presenting **any** certificate. That's the entire basis of rogue-RADIUS attacks: stand up an access point, present a self-signed certificate, and collect whatever the client offers.

Configure supplicants to validate the server certificate, pin the expected server name, and specify the trusted root. It's a supplicant-side setting, which means it belongs in your GPO or Intune profile — not in ISE.

## Phase 3 — the client proves itself

The supplicant now sends its own flight:

**Certificate** — the client certificate, with its chain.

**Client Key Exchange** — key material for deriving the session secret.

**Certificate Verify** — a signature over the handshake so far, made with the client's **private key**. This is the actual proof of possession. Anyone can copy a certificate; only the holder of the private key can produce this signature.

**Change Cipher Spec** — everything after this point uses the negotiated keys.

**Finished** — a hash of the entire handshake, verifying nothing was tampered with.

This flight fragments too, for the same reason.

### What ISE is checking

Trust chain, validity dates, Extended Key Usage including Client Authentication, revocation status, and then the part specific to network access: **mapping the certificate to an identity**.

The certificate authentication profile decides which field to use — commonly the SAN's UPN, sometimes the Common Name. That value is then looked up in Active Directory or another identity store, and **binary certificate comparison** can be enabled so ISE compares the presented certificate byte-for-byte against the one stored on the AD object. That closes the gap where a validly-issued certificate names a user who no longer exists or has been disabled.

## Phase 4 — completion

### Change Cipher Spec and Finished, from the server

The server confirms the negotiated keys and sends its own Finished.

### EAP-Response, empty

The supplicant acknowledges. The TLS handshake is complete, and both sides now hold the same master key.

### RADIUS Access-Accept

The server makes its decision and returns **Access-Accept** — carrying, alongside any authorisation attributes, the **Master Session Key** in MPPE key attributes.

That key delivery is easy to overlook and it's the reason the rest works. The authenticator never saw the TLS handshake and cannot derive keys itself; RADIUS hands it the material.

### EAP-Success

The authenticator converts the RADIUS result into an EAP frame with **Code 3** and sends it to the supplicant. A rejection becomes **Code 4**, EAP-Failure.

## Phase 5 — the 4-Way Handshake

On wireless, authentication isn't the end. The Master Session Key becomes the Pairwise Master Key, and the 4-Way Handshake derives the keys that actually encrypt traffic:

**M1** — authenticator sends its nonce (ANonce)
**M2** — supplicant sends its nonce (SNonce) with a MIC, proving it holds the PMK
**M3** — authenticator sends the group key (GTK) with a MIC
**M4** — supplicant acknowledges

Only now does the port authorise and data flow.

On wired 802.1X there is no 4-Way Handshake unless MACsec is in use. The port authorises directly on EAP-Success.

## How to read a failing capture

The exchange is long, which is helpful — **where it stops tells you what's wrong.**

| Stops after | Almost always means |
|---|---|
| Identity Response, nothing follows | The request isn't reaching ISE. Shared secret, NAD definition, or the network path. |
| TLS Start, no Client Hello | Supplicant isn't configured for EAP-TLS, or has no certificate. |
| Client Hello, no Server Hello | TLS version or cipher suite mismatch. |
| Mid-fragmentation, then restarts | Fragment loss. On wireless, look at RF before anything else. |
| Server certificate sent, then client gives up | The supplicant doesn't trust the issuing CA, or the server name doesn't match what it expects. |
| Client certificate sent, then failure | ISE doesn't trust the client's issuing CA, the certificate is expired or revoked, or identity mapping failed. |
| Full handshake, then Access-Reject | Authentication succeeded, **authorisation** failed. This is a policy problem, not a certificate problem. |

That last row matters. A completed TLS handshake followed by a reject means the certificate was fine and the policy said no. People spend hours on certificates when the detailed authentication report already said the authorisation rule didn't match.

### Where to look

**In ISE:** Operations → RADIUS → Live Logs, then the detailed report. The **Steps** panel shows the TLS handshake progressing and stopping, which maps directly onto the table above.

**On the wire:** capture at the authenticator. Wireshark filters worth knowing:

```
eapol
eap
tls.handshake.type == 1     # Client Hello
tls.handshake.type == 11    # Certificate
radius
```

**On a switch port:**

```
debug dot1x all
debug epm all
```

**On ISE**, set `runtime-AAA` to debug and read `prrt-server.log` — remembering Cisco's guidance that it should not stay at debug for more than about fifteen minutes on a busy node.

## What actually goes wrong in production

After enough of these, the distribution is not even.

**Certificate expiry.** Endpoint, server, or an intermediate CA. It worked yesterday and nothing changed. Check expiry before anything else.

**Missing intermediate.** ISE or the supplicant has the root but not the intermediate. Fails identically to an untrusted CA, and the error messages don't distinguish them.

**Supplicant not validating the server.** Not a failure — a silent weakness. Worth auditing even when everything works.

**Identity mapping.** The certificate is valid and ISE can't turn it into a user. The certificate authentication profile is looking at a field the certificate doesn't populate.

**Clock skew.** Certificate validation is time-sensitive. An endpoint with a wrong clock rejects a perfectly valid certificate. Check NTP.

**Fragment loss on wireless.** Intermittent, correlates with location, and gets blamed on ISE for days.

---

## Why it's worth the effort

The alternative to EAP-TLS is usually PEAP-MSCHAPv2, which puts a copy of a corporate password on every device. When the user changes that password, every device breaks. When they leave, the credential goes with them. And a password on an endpoint is one phishing email from being someone else's password.

EAP-TLS replaces that with a per-device credential that never leaves the device, can be revoked individually, and cannot be phished. The cost is a PKI and an enrolment process.

For most organisations that's a good trade — provided the certificate lifecycle is genuinely owned by someone. An EAP-TLS deployment with no revocation process and no expiry monitoring isn't stronger than PEAP. It's just quieter until the day it isn't.

---

**References**

- [RFC 5216 — The EAP-TLS Authentication Protocol](https://datatracker.ietf.org/doc/html/rfc5216)
- [RFC 3748 — Extensible Authentication Protocol (EAP)](https://datatracker.ietf.org/doc/html/rfc3748)
- [Cisco ISE — Troubleshoot and Enable Debugs](https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine/212594-debugs-to-troubleshoot-on-ise.html)
