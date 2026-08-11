---
title: "Cisco ISE BYOD Onboarding: Single SSID vs Dual SSID, Step by Step"
excerpt: "Both onboarding flows explained end to end, what each operating system does differently, where the MDM handoff fits, and the certificate details that decide whether it works."
date: "2025-10-30"
tags: ["Cisco ISE", "BYOD", "EAP-TLS", "MDM", "Onboarding"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Goal** | Move a personal device from a password-based connection to a certificate-based one (EAP-TLS), automatically. |
| **Single SSID** | Connect with PEAP-MSCHAPv2 → redirect to BYOD portal → register → get certificate → **reconnect to the same SSID** with EAP-TLS. |
| **Dual SSID** | Connect to open/guest SSID → MAC filtering → CWA portal → AD login → register → get certificate → **manually join the second SSID** with EAP-TLS. |
| **NSP** | Native Supplicant Profile — tells the device how to configure its own 802.1X settings. |
| **Windows** | Supplicant provisioning wizard is **pushed from ISE**. |
| **iOS** | Uses the **native browser** — Apple's Over-The-Air profile delivery. No app installed. |
| **Android** | Supplicant app is **downloaded from the internet** (Google Play). Plan for internet access on the provisioning path. |
| **MDM handoff** | Happens *after* EAP-TLS. Unknown → redirect to MDM portal. Compliant → full access. Non-compliant → limited. |
| **Needs** | ISE internal CA (or external), CoA working, DNS for the portal FQDN, and NTP. |

---

BYOD onboarding is one of those features that demos beautifully and deploys awkwardly. The concept is simple — get a personal device onto the network with a certificate instead of a password — but the flow crosses portals, certificate enrolment, supplicant provisioning and often an MDM, and every one of those is a place it can stall.

There are two flows. Which you pick has consequences you live with.

## Why bother at all

The alternative to BYOD onboarding is PEAP-MSCHAPv2 with AD credentials, permanently. That means every personal device holds a copy of a corporate password, in a credential store you don't control, on a device you don't manage.

When that user changes their password, every device breaks. When they leave, the credential goes with them. And a password on a phone is one phishing incident away from being an attacker's password.

Certificate-based EAP-TLS solves all three: the credential is device-specific, it's revocable individually, and it never leaves the device.

The onboarding flow is how you get from one to the other without a helpdesk ticket per device.

## Dual SSID flow

Two wireless networks. One open (or PSK) for provisioning, one secured for real access.

**Step by step:**

1. User connects to the open provisioning SSID
2. **MAC filtering** runs — the WLC does MAB against ISE
3. ISE returns a redirect to the **guest/CWA portal**
4. User logs in with **AD credentials** on that portal
5. Successful login starts the **BYOD flow**
6. User **registers the device** on the portal
7. Device **downloads the Native Supplicant Profile (NSP) and a certificate**
8. User **manually connects to the second SSID** — the secured one
9. That connection performs **EAP-TLS** using the new certificate

**The trade-off:** step 8 is manual, and it's where users get stuck. They've completed a wizard, been told they're done, and now need to go into wireless settings and pick a different network. On a good day it's a minor annoyance. Across a few thousand users it's a support burden.

**What it buys you:** the provisioning network is genuinely separate. You can lock it down to just what onboarding needs — ISE, DNS, and the app stores. That's a cleaner security boundary, and it means an unprovisioned device never touches the corporate SSID at all.

## Single SSID flow

One wireless network handling both provisioning and production.

**Step by step:**

1. User connects to the SSID using **PEAP-MSCHAPv2** with AD credentials
2. Authentication succeeds, but the **authorisation** rule matches "not yet registered" and returns a **redirect to the BYOD portal**
3. User **registers the device** on the portal
4. Device **downloads the NSP and certificate**
5. Device **automatically reconnects to the same SSID**, this time using **EAP-TLS**

**The advantage:** step 5 is automatic. The user doesn't choose a different network — the supplicant reconfigures itself and reconnects. Materially better experience, and materially fewer support calls.

**The trade-off:** your production SSID accepts PEAP-MSCHAPv2, which means it accepts passwords. You've kept the credential exposure you were trying to remove, at least as an entry path. You mitigate it with authorisation policy — PEAP gets you nothing but the onboarding portal — but the authentication path exists.

## Which to choose

If user experience is the priority and you can accept PEAP as a provisioning-only path, single SSID. It is the flow most enterprises land on.

If you need a hard boundary between unprovisioned and provisioned devices, or you're in a regulated environment where accepting passwords on the corporate SSID is a finding, dual SSID.

## What each operating system does differently

This is where deployments hit surprises, because the three major platforms provision in three genuinely different ways.

**Windows** — the supplicant provisioning wizard is **pushed from ISE**. The device downloads and runs an executable that configures the wired or wireless profile and installs the certificate. Users need permission to run it, which on a locked-down corporate build is a conversation with the desktop team.

**iOS** — uses the **native browser**, with no app installed at all. Apple's Over-The-Air profile delivery mechanism handles it: Safari receives a configuration profile, the user accepts a few prompts, and the device configures itself. Cleanest of the three, and the one most likely to just work.

**Android** — the supplicant app is **downloaded from the internet**, from Google Play. This is the one that catches people out. Your provisioning network must permit access to Google Play, or Android onboarding stops dead at the download. If you've locked the provisioning SSID down to ISE and DNS only, Android will fail and it will not be obvious why.

Plan the provisioning ACL around this explicitly. It needs: ISE (the portal FQDN), DNS, and the relevant app stores.

## Where MDM fits

MDM integration sits *after* onboarding, as a second gate.

Once the endpoint completes the BYOD flow and connects with EAP-TLS, it hits the MDM policy:

- **Unknown to the MDM** → URL redirect to the MDM enrolment portal
- **Known and compliant** → matches the compliant authorisation policy, full access
- **Non-compliant** → matches the non-compliant policy, limited or no access

So the endpoint passes through two provisioning stages: get a certificate, then get enrolled and compliant. Both use redirect-and-CoA, and both depend on CoA working correctly.

The compliance check itself is the MDM's judgement — jailbreak status, encryption enabled, PIN set, OS version. ISE queries the MDM via API and authorises on the answer.

## What has to be in place first

**A certificate authority.** ISE's internal CA is usually the right answer for BYOD — it's designed for exactly this, it handles the SCEP enrolment, and it manages the certificate lifecycle. An external CA works but adds an integration.

**CoA.** Every transition in both flows depends on it. If CoA doesn't work, users complete the wizard and nothing happens.

**DNS for the portal FQDN.** The redirect sends the device to a name, and that name must resolve — including for devices using public DNS servers. A portal FQDN that only resolves internally will break onboarding for anyone whose device is configured with 8.8.8.8.

**A portal certificate the device trusts.** If the portal presents a certificate the device doesn't trust, the user gets a browser warning during onboarding. Some will click through, some will call the helpdesk, and iOS in particular is unforgiving. Use a publicly-signed certificate for portals.

**NTP.** Certificate validation is time-sensitive. A device with a badly wrong clock will reject a perfectly valid certificate.

## Debugging it

Set these to debug under Operations → Troubleshoot → Debug Wizard:

- `client` → `guest.log`
- `client-webapp` → `guest.log`
- `scep` → `ise-psc.log`
- `ca-service` → `ise-psc.log`
- `admin-ca` → `ise-psc.log`
- `runtime-AAA` → `prrt-server.log`
- `profiler` → `profiler.log`

Remembering the fifteen-minute rule on `runtime-AAA`.

**Common failure points, in the order I'd check them:**

**Stalls at the portal** — DNS resolution, or the portal certificate isn't trusted.

**Certificate never arrives** — SCEP enrolment failure. `ca-service` and `scep` logs.

**Certificate arrives but reconnection fails** — the NSP is misconfigured, or the authorisation policy for EAP-TLS isn't matching. Check what the certificate's subject actually contains versus what the policy expects.

**Android stops at supplicant download** — provisioning network doesn't permit Google Play.

**Works on Wi-Fi, fails on wired** — the Windows Wired AutoConfig service (DOT3SVC) isn't running.

**Everything works, access doesn't change** — CoA. Always CoA.

---

BYOD onboarding is genuinely worth doing. It removes corporate passwords from unmanaged devices, gives you per-device revocation, and once it's running it's invisible to users. But it touches more moving parts than almost any other ISE feature, so build it in a lab first, walk all three operating systems through it, and only then let it near a user population.
