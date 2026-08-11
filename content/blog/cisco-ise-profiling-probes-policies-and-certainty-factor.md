---
title: "Cisco ISE Profiling: Probes, Certainty Factor and Why Endpoints Get the Wrong Profile"
excerpt: "How ISE decides that a MAC address is a printer. The probes available, what the certainty metric actually does, why anomalous endpoint detection matters, and how to debug a profile that won't stick."
date: "2025-10-23"
tags: ["Cisco ISE", "Profiling", "MAB", "Network Access Control", "Troubleshooting"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **What profiling does** | Identifies *what* an endpoint is, so authorisation can be based on device type rather than just MAC. |
| **Certainty factor** | Each matched condition adds points. The profile whose total exceeds its **minimum certainty metric** wins. Highest total takes it. |
| **RADIUS probe** | Uses attributes already in the authentication. Zero extra cost. Enable first. |
| **DHCP probe** | Rich data (hostname, options, vendor class). Needs an `ip helper-address` pointing at the PSN. |
| **SNMP probe** | Queries the switch for CDP/LLDP and MAC table. Needs SNMP credentials per NAD. |
| **HTTP probe** | User-Agent string. Excellent for OS identification. Requires traffic redirect or a SPAN. |
| **DNS probe** | Reverse lookup of the endpoint IP. Cheap supplementary signal. |
| **NMAP probe** | Active scan. Powerful, intrusive, and will alarm your security team. |
| **AD probe** | Machine attributes from Active Directory. |
| **Profile change** | Needs **CoA** to take effect on a live session. |
| **Anomaly detection** | Flags an endpoint whose attributes change suspiciously — the classic MAC spoof signature. |
| **Debug** | `show logging application profiler.log tail` |

---

Profiling is what makes MAB defensible.

MAB on its own authorises a MAC address, and a MAC address is trivially spoofable. Anyone can read the label on a printer, clone the address, and inherit the printer's network access. Profiling is what turns "this MAC is on the allow list" into "this endpoint behaves like a printer, is manufactured by a printer vendor, speaks a printer protocol, and is plugged into the port a printer should be on".

It doesn't make MAB strong. It makes it defensible, and it makes spoofing detectable.

## How the decision is actually made

Every profiling policy is a set of conditions, and each condition carries a **certainty factor** — a number it contributes when it matches.

The policy also has a **minimum certainty metric**: the threshold the accumulated total must exceed for the profile to apply.

So a policy for a Cisco IP phone might contain:

- MAC OUI belongs to Cisco → 10 points
- CDP cache reports a Cisco IP Phone → 20 points
- DHCP class identifier contains "Cisco Systems, Inc. IP Phone" → 20 points

With a minimum certainty of 20, an endpoint matching just the OUI doesn't qualify — plenty of Cisco devices aren't phones. Match the OUI plus CDP and it comfortably does.

Two rules govern the outcome:

**The total must exceed the minimum.** Below threshold, the policy doesn't apply at all.

**Where several policies qualify, the highest total wins.** This is why the hierarchy matters — a generic "Cisco-Device" parent and a specific "Cisco-IP-Phone-7962" child will both match, and the specific one should be scoring higher.

When an endpoint lands on a parent profile rather than the specific child you expected, the answer is almost always that the child's distinguishing conditions aren't being met — usually because the probe that would supply them isn't running.

## The probes, and what each costs you

Profiling is only as good as the data reaching it. Each probe is a different source, with a different operational cost.

### RADIUS probe

Uses attributes already present in the authentication request — MAC address, NAS-Port-Type, Called-Station-ID, Calling-Station-ID, and whatever the NAD includes.

**Cost: none.** The data is already arriving. Enable this first, always. On its own it gives you OUI-based classification, which is enough for broad categories.

### DHCP probe

The richest single source. DHCP requests carry hostname, vendor class identifier, parameter request list and client identifier — and the *pattern* of requested options is often more identifying than anything else available.

**Cost: you must get the traffic to the PSN.** Either an `ip helper-address` pointing at the PSN alongside your real DHCP server:

```
interface Vlan10
 ip helper-address 10.2.2.10
 ip helper-address 10.1.1.1
```

Or DHCP SPAN, which is heavier and less commonly worth it.

The helper-address approach is standard, but confirm your DHCP server is unaffected — you're now sending broadcasts to an additional destination, and some environments have strict expectations about that.

### SNMP probe

Queries the network device for CDP and LLDP neighbour data plus MAC address tables. CDP is exceptionally good for Cisco devices — phones and access points identify themselves precisely.

**Cost: SNMP credentials configured per network device in ISE**, and polling load on the switches. Two variants: SNMPQUERY (polled) and SNMPTRAP (the switch notifies ISE of MAC notification events).

### HTTP probe

Captures the User-Agent string, which is the best available signal for operating system and browser. Distinguishes Windows from macOS from iOS reliably.

**Cost: you need the traffic.** Either a URL redirect (which you already have if you're running guest or posture portals) or a SPAN session. Without a redirect flow in place, this probe often yields nothing.

### DNS probe

Reverse DNS lookup on the endpoint's IP. Cheap, and useful where hostnames follow a naming convention.

**Cost: negligible.** Depends entirely on your DNS hygiene.

### NMAP probe

Active port scan. Identifies devices by their open ports and service fingerprints — powerful for IoT and embedded devices that give nothing else away.

**Cost: it is an active scan.** It will show up in IDS logs, it will alarm your security team if they don't know about it, and some fragile embedded devices genuinely do not tolerate being scanned. Coordinate before enabling.

### Active Directory probe

Pulls machine attributes — OS version, machine group membership — for domain-joined endpoints.

## Profiling and CoA

Profiling frequently happens *after* the endpoint has already been authorised.

The sequence: endpoint MABs on as an unknown MAC and gets restricted access. DHCP and SNMP probes gather data over the next several seconds. The certainty factor crosses the threshold. ISE now knows it's a Cisco IP phone.

**Nothing changes until CoA fires.** Profiling reclassifies the endpoint in the database, but the live session keeps whatever authorisation it was given. CoA is what re-authorises it.

So it must be enabled on the switch:

```
aaa server radius dynamic-author
 client 10.1.1.1 server-key SharedSecretHere
```

And the profiling policy must be configured to trigger CoA on change. Without both, you'll see correct profiles in ISE and wrong authorisation on the network — which is a genuinely confusing symptom, because everything *looks* right in the GUI.

## Anomalous endpoint detection

This is the feature that turns profiling from a convenience into a security control.

Anomalous endpoint detection flags an endpoint whose profiling attributes change in ways that shouldn't happen. The canonical example: an endpoint profiled as a printer suddenly starts presenting a Windows User-Agent string, or its DHCP fingerprint changes to something entirely different.

That is the signature of MAC spoofing. Someone has cloned the printer's address onto a laptop.

The detection works on the principle that a given attribute, once established, then changes to another value — legitimate devices rarely do this. It can be configured to alert only, or to take enforcement action.

Worth enabling if you rely on MAB at any scale, because it is the compensating control that makes MAB acceptable to an auditor.

**Reference:** [Configure Anomalous Endpoint Detection](https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine-22/200973-configure-anomalous-endpoint-detection-a.html)

## Debugging a profile that won't stick

**1. Look at the endpoint's attributes.** Context Visibility → Endpoints → find the MAC → the Attributes tab shows everything ISE has collected. This is the ground truth. If the attribute your policy needs isn't there, the problem is the probe, not the policy.

**2. Work out which probe should supply it**, and confirm that probe is enabled on the PSN handling this endpoint — under the node's Profiling Configuration.

**3. Check the data is actually reaching the PSN.** DHCP data absent? The helper-address is missing or pointing at the wrong node. CDP data absent? SNMP credentials aren't configured for that switch.

**4. Watch the profiler log live:**

```
show logging application profiler.log tail
```

This shows profiling decisions as they happen, including the certainty calculation. Reproduce by bouncing the port and watch what ISE concludes.

For deeper investigation, set these to debug under Operations → Troubleshoot → Debug Wizard:

- `profiler` → `profiler.log`
- `runtime-AAA` → `prrt-server.log`
- `nsf` and `nsf-session` → `ise-psc.log`

Remembering that `runtime-AAA` at debug level is expensive and should not stay on for more than about fifteen minutes on a busy node.

**5. Check policy ordering.** If a broader policy is scoring higher than your specific one, the specific policy needs stronger conditions or a higher certainty contribution.

## Practical advice

**Enable RADIUS probing everywhere immediately.** It's free and it gives you OUI-level classification across the whole estate.

**Add DHCP next.** Best value for the effort, and the helper-address change is small and reversible.

**Profile in Monitor Mode before you enforce.** Run profiling for weeks with no authorisation dependency on it. Look at what's landing on `Unknown` and fix those policies before device type has any bearing on access.

**Don't authorise on profile alone for anything sensitive.** Profile plus certificate is a real control. Profile plus MAC is a speed bump.

**Watch for profile flapping.** An endpoint oscillating between two profiles will generate CoA each time, which means repeated re-authorisation. Usually caused by two policies with similar scores; fix by making the conditions more distinct rather than by raising thresholds.

---

Profiling is the difference between a NAC deployment that knows what's on the network and one that merely knows what's been allowed on it. Those are very different positions to be in when someone asks what that unmanaged device in the server room actually is.
