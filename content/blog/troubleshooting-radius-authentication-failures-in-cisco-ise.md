---
title: "Troubleshooting RADIUS Authentication Failures in Cisco ISE: A Complete Field Guide"
excerpt: "Which log file holds the answer, how to pull it, which debugs to enable, and how to read what comes back. A working reference for Cisco ISE 3.x RADIUS and 802.1X failures, built from thirteen years in production."
date: "2025-09-25"
tags: ["Cisco ISE", "RADIUS", "802.1X", "Troubleshooting", "EAP-TLS", "AAA"]
draft: false
---

Most RADIUS troubleshooting goes wrong in the first five minutes. Someone opens the policy set and starts reading rules, when the actual failure was a certificate the endpoint presented three layers earlier and ISE never got far enough to evaluate a rule at all.

This is the sequence I actually follow, in order, and the reasoning behind each step. It covers where the logs live, every way to get them off the box, which debug components to turn on for which symptom, and — importantly — how to turn them off again before you take the deployment down.

Written against ISE 3.x. Most of it applies to 2.7 with different menu paths, noted where it matters.

## Before you touch anything: three questions

Answer these before enabling a single debug. They cost two minutes and they usually halve the search space.

**Is it one endpoint, one user, one switch, or everything?** The blast radius points at the layer. One user across many devices is an identity store problem. One device across many users is a supplicant or NAD-port problem. Everything at once is a node, certificate, or policy change.

**What changed?** ISE deployments rarely break spontaneously. A patch, a policy edit, an AD change, a switch config push, or a certificate that quietly reached its expiry date. If nobody admits to a change, check certificate expiry anyway — it is the single most common "nothing changed" cause.

**Does it fail consistently or intermittently?** Consistent failures are configuration. Intermittent failures are load, replication, timeouts, or one node in a cluster behaving differently from its peers. That distinction changes which node you collect from.

## Step 1: Live Logs, and the only column that matters

Everything starts at **Operations → RADIUS → Live Logs**.

Filter to the endpoint MAC or username. Find the failed attempt. Then read the **Failure Reason** column, and nothing else yet.

That single field puts you in one of three categories, and each has a completely different investigation path:

**Authentication failed.** The credential or certificate was rejected. This is an identity store or PKI problem. Policy is irrelevant — ISE never got there.

**Authorization failed.** Identity was verified fine, but no authorization rule matched, or the rule that matched denied. This is a policy problem, and this is the only case where opening the policy set first is correct.

**No response / dropped.** ISE never received a complete conversation. The problem is the endpoint, the supplicant configuration, the NAD, or the network path between them. Nothing on ISE will fix it.

Most wasted hours come from investigating category two when you are actually in category three.

### Open the detailed report

Click the magnifying glass on the failed entry. The detailed authentication report gives you, in one page:

- **Authentication Details** — the full policy path taken: which policy set, which authentication rule, which authorization rule, and where it stopped
- **Steps** — the RADIUS and EAP conversation, step by step, with the exact point of failure
- **Other Attributes** — every RADIUS attribute the NAD sent, which is where you find out the switch is sending a different NAS-Port-Type than you assumed
- **Result** — the attributes ISE sent back

The **Steps** panel is the most under-used thing in the product. It shows the EAP handshake progressing and then stopping. Where it stops tells you which side gave up.

### Reading the Steps panel

A healthy EAP-TLS conversation walks through, roughly: RADIUS Access-Request received → EAP-Response/Identity → negotiate EAP-TLS → client hello → server hello with certificate → client certificate → validate → identity resolution → authorization → Access-Accept.

Where it stops maps directly to a cause:

| Stops at | Almost always means |
|---|---|
| Received RADIUS Access-Request, nothing after | Shared secret mismatch, or NAD not defined in ISE |
| EAP-Response/Identity then silence | Supplicant gave up — check the switch's `dot1x timeout` values |
| During TLS handshake | Certificate chain, trust store, or a TLS version mismatch |
| Client certificate presented, then failure | Trust store missing an intermediate, expired cert, or a failed revocation check |
| Identity resolved, then authorization failure | Genuinely a policy problem — now open the policy set |

## Step 2: Know your log files

ISE writes to a lot of files. For RADIUS and 802.1X work you care about five, and mostly one.

| Log file | What lives in it |
|---|---|
| `prrt-server.log` | **The one that matters.** The runtime AAA process. Every RADIUS packet, EAP exchange, policy evaluation and identity lookup. |
| `ise-psc.log` | Policy service container. Policy engine decisions, node communication, general application behaviour. |
| `ad_agent.log` | Active Directory connector. Joins, LDAP queries, group lookups, DNS resolution, Kerberos. |
| `localStore/iseLocalStore.log` | Local copy of every passed and failed authentication, plus system statistics. |
| `profiler.log` | Endpoint profiling. Relevant when authorization depends on device type. |

Two more worth knowing about: `guest.log` for portal and BYOD flows, and `replication.log` when nodes disagree about configuration.

For a straightforward "why did this authentication fail", `prrt-server.log` on the PSN that handled the request is where the answer is. Note that carefully — **the PSN that handled it**, not the primary admin node. In a load-balanced deployment, collecting from the wrong node gets you a file with nothing in it.

## Step 3: Getting the logs off the box

Four ways, each suited to a different situation.

### Method A — Live tail from the CLI

Fastest for reproducible problems. SSH to the node and watch the log while you trigger the failure.

List what's available:

```bash
show logging application
```

You'll get something like:

```
      11947 Jul 18 2024 12:20:28  ad_agent.log
      96501 Jul 18 2024 13:29:33  collector.log
     116751 Jul 18 2024 13:30:00  guest.log
     196958 Jul 18 2024 13:01:20  ise-elasticsearch.log
    5136021 Jul 18 2024 13:31:24  ise-psc.log
     172755 Jul 18 2024 13:29:04  profiler.log
   10596813 Jul 18 2024 13:31:10  prrt-server.log
      28496 Jul 18 2024 12:37:04  redis.log
       3489 Jul 18 2024 12:36:44  replication.log
```

Then follow the runtime log live:

```bash
show logging application prrt-server.log tail
```

Reproduce the failure and watch. `Ctrl + C` once to stop.

Filter to something specific rather than reading everything:

```bash
show logging application prrt-server.log | include 00:11:22:33:44:55
```

If you're not sure of the exact filename, filter the listing itself:

```bash
show logging application | include pxgrid
```

### Method B — System logs

Different command, different folder. This is the OS layer rather than the application layer — use it when a *service* is misbehaving rather than an authentication.

```bash
show logging system
```

```bash
show logging system ade/ADE.log tail
```

`ADE.log` is where you find application start and stop events, service crashes, and the reason a node came back up unexpectedly.

### Method C — Support bundle from the GUI

The right answer when you're opening a TAC case, or when you need a full picture across a time window.

Go to **Operations → Troubleshoot → Download Logs**, select the node that handled the failed request, and choose:

- ☐ Include full configuration database *(large; only when TAC asks)*
- ☑ Include debug logs
- ☑ Include local logs
- ☐ Include core files *(only for crashes)*
- ☑ Include monitor and report logs
- ☑ Include system logs

Set an encryption key, choose the day range covering your reproduction, and download.

Three things that make the difference between a bundle TAC can use and one they can't: collect from the **correct node**, cover the **exact time window** of the reproduction, and record the **endpoint MAC and the timestamp** separately so nobody has to guess.

### Method D — Packet capture

When Live Logs shows nothing at all, the question stops being "why did ISE reject this" and becomes "did ISE ever receive it". A capture settles that in thirty seconds.

**Operations → Troubleshoot → Diagnostic Tools → General Tools → TCP Dump.** Pick the node and interface, apply a filter, start, reproduce, stop, download the pcap.

Standard tcpdump filter syntax works:

```
host 10.0.2.1 and port 1812
```

For a specific endpoint through a specific NAD:

```
host 10.10.10.5 and (port 1812 or port 1813)
```

Then in Wireshark, `radius` as a display filter. What you're looking for:

- **No packets at all** — the NAD isn't sending. Check the switch's RADIUS server config, routing, and any firewall between them.
- **Access-Request with no Access-Accept or Access-Reject** — ISE received it and dropped it silently. Almost always an unknown NAD (not defined in Network Devices) or a shared secret mismatch.
- **Access-Request retransmissions** — ISE is responding too slowly, or responses are being lost on the return path.
- **Access-Reject immediately** — ISE made a decision. Go back to Live Logs; the answer is there.

That third case is worth dwelling on. Repeated identical Access-Requests with incrementing retries mean the NAD isn't hearing the reply. Check for asymmetric routing or a firewall dropping the return path — the request arrives fine, the answer never gets home.

## Step 4: Enabling debugs

Only when the detailed report and a capture haven't answered it. Debugs are expensive and they are not free to leave on.

### Where the switch is

**ISE 3.x:** Operations → Troubleshoot → Debug Wizard → Debug Log Configuration
**ISE 2.x:** Administration → System → Logging → Debug Log Configuration

Select the node, find the component, set the level, save.

### Which components for which problem

This is the part worth bookmarking. Component names, and the file each one writes to.

**802.1X and MAB failures**

- `runtime-AAA` → `prrt-server.log`
- `nsf` → `ise-psc.log`
- `nsf-session` → `ise-psc.log`

**Active Directory problems** *(set these to TRACE, not DEBUG)*

- `Active Directory` → `ad_agent.log`
- `identity-store-AD` → `ad_agent.log`
- `runtime-AAA` → `prrt-server.log`
- `nsf` and `nsf-session` → `ise-psc.log`

**Policy and rule evaluation**

- `RuleEngine-Policy-IDGroups` → `ise-psc.log`
- `RuleEngine-Attributes` → `ise-psc.log`
- `Policy-Engine` → `ise-psc.log`
- `epm-pdp` and `epm-pip` → `ise-psc.log`

**Profiling affecting authorization**

- `profiler` → `profiler.log`
- `runtime-AAA` → `prrt-server.log`
- `nsf` and `nsf-session` → `ise-psc.log`

**LDAP identity stores**

- `runtime-aaa` → `prrt-server.log`

**ODBC identity stores**

- `odbc-id-store` → `prrt-management.log` and `prrt-server.log`

**TACACS+ device administration**

- `runtime-AAA` → `prrt-server.log`

**Certificate provisioning and BYOD onboarding**

- `client` and `client-webapp` → `guest.log`
- `scep`, `ca-service`, `admin-ca` → `ise-psc.log`
- `runtime-AAA` → `prrt-server.log`
- `profiler` → `profiler.log`

**Guest portal**

- `guestaccess`, `guest-admin`, `guest-access-admin` → `guest.log`
- `portal`, `portal-session-manager`, `portal-web-action` → `guest.log`
- `saml` → `guest.log` *(only if SAML is in use)*

**Replication and nodes disagreeing**

- `Replication-Deployment`, `Replication-JGroup` → `replication.log`, `ise-psc.log`
- `Replication Tracker` → `tracking.log`
- `hibernate` → `hibernate.log`
- `JMS` → `replication.log`

### The warning that actually matters

Cisco's guidance is explicit, and it is not conservative advice you can quietly ignore:

> Enabling debug logging for **runtime-aaa**, **runtime-logging** and **runtime-config** significantly impacts system performance. These logs must not be set to debug for **more than 15 minutes** to avoid performance degradation.

On a busy PSN, `runtime-AAA` at debug level will generate gigabytes and can push CPU into a state where authentications start timing out — turning a troubleshooting session into an outage. Setting `runtime-AAA` to debug also silently sets `prrt-JNI` to debug; that's expected, not a fault.

Practical approach: enable, reproduce immediately, disable. Not "enable and leave it until someone reports the problem again."

### Debug Profiles

ISE 3.x has predefined debug templates under **Operations → Troubleshoot → Debug Wizard → Debug Profile Configuration**. Pick a template, assign it to a node, and the whole component set applies at once.

Two things to know:

**A template does nothing until you assign a node to it.** Editing the template alone changes no behaviour.

**Don't mix "Reset to Default" with an active template.** Resetting while a Debug Profile is enabled returns the components to default but leaves the template showing as enabled — so the interface and reality disagree, and the next person to look will be misled. Disable the template properly by unchecking its node.

### Turning debugs back off

**Operations → Troubleshoot → Debug Wizard → Debug Log Configuration** → select the node → **Reset to Default** → Yes.

Do this as part of the same maintenance window. Debug settings left on are one of the more common causes of a PSN that mysteriously runs hot weeks later.

## The five failures you'll actually see

After enough of these, the distribution is not evenly spread.

### 1. Certificate expiry

The endpoint worked yesterday. Nothing changed. It fails today.

Check, in order: the EAP authentication certificate on the PSN, the endpoint's own certificate, and every CA in the chain. An expired intermediate produces a failure that looks identical to a misconfigured trust store, which sends people looking in entirely the wrong place.

Under **Administration → System → Certificates**, confirm the issuing CA is present in the Trusted Certificates store *and* has "Trust for client authentication and Syslog" enabled. Present but not trusted for client auth is a genuinely common configuration slip.

### 2. Shared secret mismatch

Symptom: Live Logs shows nothing at all, but a packet capture shows Access-Requests arriving.

ISE silently drops packets it cannot authenticate. It will not tell you the secret is wrong, because it cannot verify who sent them.

Re-enter the secret on both sides rather than comparing them by eye. Trailing whitespace pasted into a switch config is invisible and accounts for more of these than anyone admits.

### 3. NAD not defined, or wrong IP

Same symptom as above. ISE only accepts RADIUS from devices in **Administration → Network Resources → Network Devices**.

The catch: it must match the **source IP of the RADIUS packet**, which on a switch is determined by `ip radius source-interface`. A switch with several SVIs may be sourcing from something other than the address you added. The capture tells you the true source in seconds.

### 4. Active Directory disconnection

Symptom: everything fails at once, and `ad_agent.log` fills with errors.

Check the join status under **Administration → Identity Management → External Identity Sources → Active Directory**. If it shows disconnected, look at DNS resolution from the node, NTP skew, and whether the machine account password rotated.

Time skew is the underrated one. Kerberos allows about five minutes of drift. A node whose NTP has quietly failed will authenticate fine for days and then stop, with no configuration change to blame.

### 5. Policy matching the wrong rule

Symptom: authentication succeeds, but the endpoint lands in the wrong VLAN or gets a restrictive dACL.

The detailed report shows exactly which rule matched. Compare its conditions against the **Other Attributes** section of the same report — that's the ground truth of what the NAD actually sent, as opposed to what you believe it sends.

Frequent cause: a rule earlier in the set is broader than intended and swallows the request before your specific rule is reached. ISE evaluates top to bottom and stops at the first match.

## A workflow you can hand to someone else

1. Live Logs → find the failure → read Failure Reason → categorise it
2. Open the detailed report → read the **Steps** panel → note where the conversation stops
3. Check **Other Attributes** → confirm the NAD is sending what you assume
4. Nothing in Live Logs at all? → TCP Dump → is ISE even receiving the request?
5. Still unclear? → enable the specific debug components for that symptom, **on the node that handled it**
6. Reproduce, and record the exact timestamp and endpoint MAC
7. **Turn the debugs off**
8. `show logging application prrt-server.log | include <MAC>` — or pull a support bundle if it's going to TAC

Steps one to three answer it most of the time. The instinct to skip to step five is what turns twenty-minute problems into afternoon ones.

## What to write down before you escalate

If it is going to TAC, having these ready saves an entire round trip:

- ISE version and patch level (`show version`)
- The node that processed the request, and its role
- Endpoint MAC address and username
- Exact timestamp of a reproduction, with timezone
- The Failure Reason string, verbatim
- Whether it's one endpoint or many, one NAD or many
- What changed, and when
- Support bundle covering the reproduction window, from the correct node

That list is also a decent self-check. More than once I've assembled it and spotted the answer while writing it down.

---

*Written from production experience across enterprise ISE deployments. Technical references drawn from Cisco's TAC documentation, linked below.*

**References**

- [Troubleshoot and Enable Debugs on ISE](https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine/212594-debugs-to-troubleshoot-on-ise.html) — Cisco, Document ID 212594, updated April 2026
- [Use Debugging System to Troubleshoot ISE](https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine/222247-use-debugging-system-to-troubleshoot-ise.html) — Cisco, Document ID 222247, updated November 2025
- [Cisco ISE Administrator Guide, Release 3.3 — Troubleshoot](https://www.cisco.com/c/en/us/td/docs/security/ise/3-3/admin_guide/b_ise_admin_3_3/b_ISE_admin_33_troubleshooting.html)
