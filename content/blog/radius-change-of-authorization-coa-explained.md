---
title: "RADIUS Change of Authorization (CoA) in Cisco ISE: How It Works and Why It Fails"
excerpt: "CoA is what lets ISE change an endpoint's access after it has already been authorised. Here's the packet flow, the ports, the switch configuration, and the four reasons it silently doesn't work."
date: "2025-10-16"
tags: ["Cisco ISE", "RADIUS", "CoA", "Posture", "Troubleshooting"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **What it is** | RFC 5176 — lets the RADIUS server change or terminate an existing session without waiting for re-authentication. |
| **Ports** | **UDP 3799** (RFC standard) or **UDP 1700** (legacy Cisco). Get this wrong and CoA silently fails. |
| **Direction** | ISE → NAD. This is the reverse of normal RADIUS, which is why firewalls break it. |
| **Enable on switch** | `aaa server radius dynamic-author` then `client <ISE-IP> server-key <secret>` |
| **CoA-Request** | Change the session's authorisation. |
| **Disconnect-Request** | Terminate the session entirely. |
| **Used by** | Posture, BYOD onboarding, profiling changes, MDM compliance, guest login, ANC quarantine. |
| **Silent failure #1** | Wrong port (3799 vs 1700). |
| **Silent failure #2** | Firewall blocking the reverse direction. |
| **Silent failure #3** | Shared secret mismatch on the dynamic-author client. |
| **Silent failure #4** | CoA sent to the wrong NAD IP because of `ip radius source-interface`. |

---

RADIUS, as originally designed, is a one-way conversation. The network device asks, the server answers, the session is established, and that's the end of it. Whatever authorisation the endpoint received, it keeps until it disconnects.

That model breaks the moment you want to do anything interesting. Posture assessment needs to grant limited access, run a check, then upgrade access. BYOD onboarding needs to move a device from a provisioning SSID to full access. Profiling needs to re-authorise a device once it's been identified as a printer rather than an unknown MAC.

**Change of Authorization** is the mechanism that makes all of that possible.

## What CoA actually is

Defined in **RFC 5176** as "Dynamic Authorization Extensions to RADIUS", CoA lets the RADIUS server initiate a conversation with the network device — the opposite of normal RADIUS flow.

Two message types:

**CoA-Request** — change the authorisation of an existing session. New dACL, different VLAN, different SGT. The session continues; only its permissions change.

**Disconnect-Request** — terminate the session. The endpoint has to authenticate again from scratch.

The network device answers with an ACK or a NAK. A NAK with a cause code is genuinely useful diagnostic information; an ACK followed by nothing changing is the more confusing failure.

## The port question

This trips up more deployments than anything else in CoA.

| Port | Origin |
|---|---|
| **UDP 3799** | The RFC 5176 standard port |
| **UDP 1700** | Cisco's legacy pre-standard port |

Both are still in use. Older IOS defaults to 1700; newer platforms use 3799. ISE has to be configured with whichever the network device expects, per network device.

When they disagree, ISE sends CoA into the void. There's no error on the switch — it never received anything. In ISE you'll see the CoA marked as failed or timed out, which is at least a signal, but only if you go looking.

**Check the switch:**

```
show running-config | include dynamic-author
show running-config aaa | include 3799|1700
```

## Switch configuration

Minimal working config:

```
aaa server radius dynamic-author
 client 10.1.1.1 server-key SharedSecretHere
 auth-type any
```

Line by line:

**`aaa server radius dynamic-author`** — enters dynamic authorisation configuration. Without this the switch simply doesn't listen for CoA at all.

**`client 10.1.1.1 server-key <secret>`** — which ISE node may send CoA, and the shared secret for that direction. Note this is configured *per PSN*. In a distributed deployment every PSN that might send CoA needs a `client` line. Missing PSNs is a common and confusing partial failure — CoA works for some endpoints and not others depending on which PSN handled them.

**`auth-type any`** — how the switch validates the CoA request. `any`, `all`, or `session-key`. `any` is the pragmatic default.

To specify a non-default port:

```
aaa server radius dynamic-author
 client 10.1.1.1 server-key SharedSecretHere
 port 3799
```

On a WLC the equivalent lives in the RADIUS server definition — the "Support for CoA" toggle, which must be enabled per server.

## Where CoA is used

Almost every advanced ISE feature depends on it:

**Posture assessment.** The endpoint authenticates and gets limited access plus a redirect to the posture portal. The agent runs its checks and reports back. ISE sends CoA, and the endpoint moves to compliant access — without the user doing anything.

**BYOD onboarding.** After certificate provisioning, CoA re-authorises the device so it can reconnect with EAP-TLS.

**Profiling.** An endpoint MABs on as an unknown MAC with restricted access. Profiling probes identify it as a Cisco IP phone. ISE issues CoA and it gets the voice authorisation profile. Without CoA, that reclassification does nothing until the device reconnects.

**MDM compliance.** Device moves from unknown to compliant, CoA upgrades its access.

**Guest access.** User authenticates on the portal, CoA moves them from redirect to permitted.

**ANC quarantine.** A security tool detects a compromised host, calls the ISE API, and ISE issues CoA to quarantine it immediately — this is the mechanism behind rapid threat containment.

The guest flow is worth stating plainly, because it's the clearest illustration: RADIUS NAC allows ISE to send a CoA-Request indicating the user is now authenticated and may access the network. It is also used for posture assessment, where ISE changes the user's profile based on the posture result.

## The four ways it silently fails

### 1. Port mismatch

Covered above. ISE is configured for 3799, the switch listens on 1700, and nothing arrives. Check both sides explicitly rather than assuming the default.

### 2. Firewall blocking the reverse path

This is the one that catches well-designed networks.

Normal RADIUS is NAD → ISE. Every firewall rule anyone wrote was for that direction. CoA is **ISE → NAD**, which is a new flow that nobody opened.

It works perfectly in the lab, where everything is flat. It fails at the branch site behind a firewall, and it fails in a way that looks like a posture problem rather than a network problem.

If posture works in the data centre and fails at branches, check this before anything else.

### 3. Shared secret mismatch

The `server-key` in the `dynamic-author` block is a separate configuration item from the RADIUS server shared secret. They are usually the same value, but they are set in different places — and someone rotating one and not the other is entirely normal.

Symptom: the switch receives the CoA and discards it as unauthenticated. `debug radius` on the switch shows it arriving and being rejected.

### 4. Wrong destination IP

ISE sends CoA to the IP address it has recorded for that network device. If the switch is sourcing RADIUS from one interface but ISE has it defined under a different address, the CoA goes to an address that isn't listening.

```
ip radius source-interface Loopback0
```

Make sure the address in ISE's Network Devices matches whatever this resolves to. A device with several SVIs is where this goes wrong.

## Troubleshooting sequence

**1. Did ISE send it?** Live Logs shows CoA events. Look for the CoA entry alongside the original authentication. No CoA event at all means the problem is in policy, not in CoA.

**2. Did the switch receive it?**

```
debug radius
debug aaa coa
```

You'll see the inbound CoA-Request and the response. If nothing appears, the packet never arrived — go to the network path.

**3. Did the switch accept it?** A NAK with a cause code tells you why. Common ones: session not found (the session ID ISE has is stale), and administratively prohibited (authorisation failure — check the shared secret).

**4. Did the session actually change?**

```
show authentication sessions interface Gi1/0/10 details
```

Compare the applied authorisation before and after. An ACK followed by no change usually means the new authorisation profile is broken — a dACL that doesn't exist on the switch, or a VLAN that isn't configured.

**5. Packet capture if still unclear.** ISE's TCP Dump tool with a filter of `host <switch-ip> and port 3799` settles the "was it sent" question definitively.

## A design note

CoA introduces a dependency that's easy to miss: your network devices must be reachable *from* ISE, not just the other way round. That has implications for NAT, for firewall policy, and for any design where PSNs sit in a different security zone from the access layer.

Worth writing into the design document explicitly, because it's the kind of requirement that gets discovered during a posture rollout six months later, when changing the firewall policy has become a change-control exercise rather than a configuration task.
