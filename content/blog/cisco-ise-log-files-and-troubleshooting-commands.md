---
title: "Cisco ISE Log Files: Which One Holds the Answer, and How to Read It"
excerpt: "A reference for every ISE log worth knowing, the CLI commands to reach them, the debug components mapped to each file, and the fifteen-minute rule that stops troubleshooting becoming an outage."
date: "2025-11-27"
tags: ["Cisco ISE", "Troubleshooting", "Logging", "CLI", "Debug"]
draft: false
---

## Cheat sheet

| Log file | What's in it |
|---|---|
| `prrt-server.log` | **Runtime AAA.** Every RADIUS packet, EAP exchange, policy evaluation. The default answer. |
| `ise-psc.log` | Policy service container. Policy engine, node communication, portals, general application. |
| `ad_agent.log` | Active Directory connector — joins, LDAP, Kerberos, DNS. |
| `guest.log` | Guest, portals, BYOD client provisioning. |
| `profiler.log` | Endpoint profiling decisions. |
| `localStore/iseLocalStore.log` | Local copy of passed/failed auths, plus system statistics. |
| `replication.log` | Node-to-node configuration replication. |
| `pxgrid/pxgrid-server.log` | pxGrid publish/subscribe. |
| `ade/ADE.log` | **System layer.** Application start/stop, service crashes. |

| Command | Purpose |
|---|---|
| `show logging application` | List application logs |
| `show logging application <file> tail` | Follow live. `Ctrl+C` once to stop |
| `show logging application <file> \| include <text>` | Filter |
| `show logging application \| include <word>` | Find a log file by name |
| `show logging system` | List system logs |
| `show logging system ade/ADE.log tail` | Follow the system log |

**The rule that matters:** `runtime-aaa`, `runtime-logging` and `runtime-config` at debug level must not stay on for more than **15 minutes** on a production node.

---

ISE writes a lot of logs. Knowing which one holds the answer is most of the skill, because searching the wrong file thoroughly is worse than searching the right one carelessly.

## The two commands

ISE separates logs into two folders, reached by two different commands.

### Application logs

Feature-level logging — authentication, profiling, portals, replication. This is where you spend most of your time.

```
show logging application
```

Returns something like:

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

Follow one live:

```
show logging application prrt-server.log tail
```

`Ctrl + C` once to stop.

### System logs

The operating system layer. Use this when a *service* is misbehaving rather than an authentication.

```
show logging system
```

```
    5105179 Jul 17 2024 20:09:49  ade/ADE.log
      29542 Jan 02 2024 16:36:28  anaconda/anaconda.log
        564 Jan 02 2024 17:07:06  boot.log
    4623022 Jul 17 2024 20:11:43  messages
    4173362 Jul 17 2024 20:11:11  secure
```

`ADE.log` is the important one — application start and stop events, service failures, and the reason a node rebooted when nobody admits to rebooting it.

```
show logging system ade/ADE.log tail
```

## Filtering, which you should do by default

Reading an entire `prrt-server.log` is not a strategy. It's ten megabytes and rotating.

Filter by endpoint:

```
show logging application prrt-server.log | include 00:11:22:33:44:55
```

Filter by keyword:

```
show logging application guest.log | include portalwebaction
```

Errors only:

```
show logging application ise-psc.log | include ERROR
```

System statistics from the local store:

```
show logging application localStore/iseLocalStore.log | include "70000 NOTICE"
```

That last one returns lines with CPU utilisation, network throughput, disk usage per mount, average RADIUS request latency, active session count — a useful periodic health snapshot. Note that on some releases and patch levels the escaped form `| include 70000\ NOTICE\` is required instead; if one produces nothing, try the other.

### Finding a file when you don't know its name

```
show logging application | include pxgrid
```

```
   14059847 Jul 18 2024 20:46:09  pxgrid/pxgrid-server.log
    5367398 Jul 12 2024 23:59:39  pxgrid/pxgrid-server.log.2024-07-12-1
   16261440 Jul 13 2024 23:59:44  pxgrid/pxgrid-server.log.2024-07-13-1
```

This also surfaces the **rotated** files, which matters when the incident was yesterday.

## Debug components mapped to log files

Debug configuration lives at:

- **ISE 3.x:** Operations → Troubleshoot → Debug Wizard → Debug Log Configuration
- **ISE 2.x:** Administration → System → Logging → Debug Log Configuration

Select the node, set the component level, save. Here's the mapping worth keeping.

**802.1X and MAB**
`runtime-AAA` → `prrt-server.log` · `nsf`, `nsf-session` → `ise-psc.log`

**Active Directory** *(TRACE, not debug)*
`Active Directory`, `identity-store-AD` → `ad_agent.log` · `runtime-AAA` → `prrt-server.log`

**Policy and rule evaluation**
`RuleEngine-Policy-IDGroups`, `RuleEngine-Attributes`, `Policy-Engine`, `epm-pdp`, `epm-pip` → `ise-psc.log`

**Profiling**
`profiler` → `profiler.log` · `runtime-AAA` → `prrt-server.log` · `nsf`, `nsf-session` → `ise-psc.log`

**Posture**
`posture`, `provisioning`, `swiss` → `ise-psc.log` · `portal`, `client-webapp` → `guest.log` · `runtime-AAA` → `prrt-server.log`

**Guest portal**
`guestaccess`, `guest-admin`, `guest-access-admin`, `portal`, `portal-session-manager`, `portal-web-action` → `guest.log` · `saml` → `guest.log` *(only if SAML in use)*

**BYOD and onboarding**
`client`, `client-webapp` → `guest.log` · `scep`, `ca-service`, `admin-ca` → `ise-psc.log`

**pxGrid** *(TRACE)*
`pxgrid` → `pxgrid-server.log` · `infrastructure`, `ers` → `ise-psc.log`

**TACACS+**
`runtime-AAA` → `prrt-server.log`

**LDAP**
`runtime-aaa` → `prrt-server.log`

**ODBC identity stores**
`odbc-id-store` → `prrt-management.log`, `prrt-server.log`

**Replication**
`Replication-Deployment`, `Replication-JGroup` → `replication.log`, `ise-psc.log` · `Replication Tracker` → `tracking.log` · `hibernate` → `hibernate.log` · `JMS` → `replication.log`

**TrustSec**
`sxp`, `sgtbinding` → `sxp_appserver/sxp.log` · `runtime-AAA` → `prrt-server.log`

**Certificate provisioning portal**
`ca-service` → `caservice.log` · `admin-ca`, `clientprovisioningportal` → `ise-psc.log`

**Context Visibility**
`vcs`, `vcs-db` → `ise-elasticsearch.log` / `vcs.log`

**Licensing**
`License`, `admin-license` → `ise-psc.log`

**RBAC**
`accessfilter` → `ise-psc.log`

**REST / ERS**
`ers` → `ise-psc.log`

**PAN failover**
`Infrastructure`, `PanFailover` → `ise-psc.log`

## The fifteen-minute rule

Cisco's guidance is explicit and worth quoting:

> Enabling debug logging for **runtime-aaa**, **runtime-logging** and **runtime-config** significantly impacts system performance. These logs must not be set to debug for **more than 15 minutes** to avoid performance degradation.

On a busy PSN this is not conservative advice. `runtime-AAA` at debug generates gigabytes and can push CPU high enough that authentications start timing out — turning a troubleshooting exercise into the outage you were investigating.

Also worth knowing: setting `runtime-AAA` to debug silently sets `prrt-JNI` to debug as well. That's expected behaviour, not a fault.

**The discipline:** enable, reproduce immediately, disable. Record the timestamp and the endpoint MAC while you do it.

## Debug Profiles

ISE 3.x provides predefined debug templates at **Operations → Troubleshoot → Debug Wizard → Debug Profile Configuration**. Select a template, assign a node, and the whole component set applies at once. You can also build your own.

Two behaviours that catch people:

**A template does nothing until a node is assigned to it.** Editing the template alone changes no logging.

**Don't use "Reset to Default" while a Debug Profile is enabled.** It returns the components to their defaults but leaves the template showing as enabled — so the interface says one thing and the node does another. Disable the template properly by unchecking its node instead.

## Turning debugs off

**Operations → Troubleshoot → Debug Wizard → Debug Log Configuration** → select node → **Reset to Default** → Yes.

Do it in the same session you enabled them. Debug settings left on are a common cause of a node that mysteriously runs hot weeks later, and by then nobody remembers why.

## Collecting a support bundle

For TAC, or when you need a full picture across a window.

**Operations → Troubleshoot → Download Logs**, select the node, then:

- ☐ Include full configuration database *(large; only when asked)*
- ☑ Include debug logs
- ☑ Include local logs
- ☐ Include core files *(crashes only)*
- ☑ Include monitor and report logs
- ☑ Include system logs

Set an encryption key, choose the day range covering the reproduction, download.

Three things separate a useful bundle from a useless one: the **correct node**, a range covering the **actual reproduction**, and a note of the **endpoint MAC and timestamp** so nobody has to guess.

## Picking the right node

This is the mistake that wastes the most time in distributed deployments.

Logs live on the node that did the work. An authentication handled by PSN-3 in Singapore is in PSN-3's `prrt-server.log` — not on the primary PAN, not on PSN-1.

Live Logs tells you which node served the request. Read that first, then collect from there.

---

**References**

- [Troubleshoot and Enable Debugs on ISE](https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine/212594-debugs-to-troubleshoot-on-ise.html) — Cisco, Doc ID 212594
- [Use Debugging System to Troubleshoot ISE](https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine/222247-use-debugging-system-to-troubleshoot-ise.html) — Cisco, Doc ID 222247
