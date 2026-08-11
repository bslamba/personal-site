---
title: "Cisco ISE Node Registration and Replication: How a Deployment Holds Together"
excerpt: "What actually happens when you register a node, how configuration replicates from the primary PAN, what breaks it, and how to diagnose a node that won't sync."
date: "2026-03-12"
tags: ["Cisco ISE", "Replication", "Deployment", "Operations", "Troubleshooting"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Source of truth** | The **primary PAN**. All configuration changes happen there and replicate outward. |
| **Registration** | A standalone node joins a deployment. Its local configuration is **overwritten** by the primary PAN's. |
| **Prerequisites** | DNS forward *and* reverse resolution · NTP in sync · certificate trust between nodes · required ports open |
| **Sync states** | In Sync · Syncing · Out of Sync · Replication Disabled |
| **Manual resync** | Deployment → select node → **Syncup**. Full config push. Disruptive on large deployments. |
| **What replicates** | Configuration only — policy, network devices, certificates, portals. |
| **What doesn't** | Operational data. Logs go to MnT separately; endpoint context propagates differently. |
| **Debug** | `Replication-Deployment`, `Replication-JGroup` → `replication.log` + `ise-psc.log` · `Replication Tracker` → `tracking.log` · `hibernate` → `hibernate.log` · `JMS` → `replication.log` |

---

An ISE deployment is several nodes behaving as one system. The mechanism that makes that true is replication from the primary PAN, and when it stops working the symptoms are confusing: policy that exists on one node and not another, changes that appear to save and then don't take effect, endpoints authenticating differently depending on which PSN they hit.

## What registration actually does

A node starts life **standalone** — all personas, its own configuration, its own database.

Registering it into a deployment does something more drastic than the word suggests: **the node's local configuration is discarded and replaced with the primary PAN's**.

That is worth understanding before you register anything. Configuration you built on a standalone node is gone the moment it joins. The correct sequence is always: build the primary PAN with the configuration you want, then register the other nodes into it.

### The registration sequence

**1.** On the primary PAN: Administration → System → Deployment → **Register**.

**2.** Provide the new node's FQDN, admin credentials, and the personas it should run.

**3.** The primary PAN validates it can reach the node and that certificates are trusted.

**4.** The node's configuration database is replaced with a copy from the primary.

**5.** The node restarts its application services.

**6.** It appears in the deployment, initially **Syncing**, then **In Sync**.

That process takes several minutes and the node is unavailable throughout. Register nodes during a window, not during business hours.

## The four prerequisites

Registration failures are almost always one of these, and all four are checkable in advance.

### DNS — forward and reverse

Every node must resolve every other node's FQDN, **and** the reverse lookup must return the matching name.

Reverse is the one people miss. Forward DNS is configured as a matter of course; PTR records often aren't. ISE checks both, and a missing PTR produces a registration failure whose error message points at certificates rather than DNS.

```
nslookup ise-psn1.example.com
nslookup 10.1.1.20
```

Both must be right, from every node.

### NTP

All nodes must have closely synchronised clocks. Certificate validation is time-sensitive, and the internal communication between nodes uses certificates.

A node whose clock is materially wrong will fail to register with a certificate error that gives no hint that time is the problem.

### Certificate trust

The nodes authenticate to each other with certificates. Each must trust the other's issuing CA.

With ISE's internal CA this is generally handled. With an external PKI, confirm the CA chain — including intermediates — is present in the trust store on every node, and marked as trusted for the appropriate purposes.

### Ports

The nodes need specific TCP ports open between them for replication, database sync and messaging. In a distributed deployment with firewalls between sites, this is a change request that should be raised well before the build.

## Replication in operation

Once registered, the primary PAN pushes configuration changes to every node.

**What replicates:** authorisation policy, authentication policy, network devices, identity sources, certificates, portals, profiling policies — the configuration database.

**What doesn't:** operational data. Authentication logs go to the MnT nodes through a separate mechanism. Endpoint context and session information propagate through different channels again.

That distinction explains a common confusion: a node can be perfectly in sync for configuration while its logging is broken, or vice versa. They're separate paths and they fail separately.

## Reading the sync state

Administration → System → Deployment shows each node's state:

**In Sync** — configuration matches the primary. Normal.

**Syncing** — a change is being applied. Transient, and normal after a configuration change or a restart.

**Out of Sync** — the node's configuration does not match and automatic replication hasn't resolved it. This needs attention.

**Replication Disabled** — replication to this node has been stopped, either deliberately or because of repeated failures.

**The symptom to watch for:** a node stuck in Syncing for a long time on a large deployment may be genuinely working — a full sync takes a while. A node in Syncing for hours is not.

## When a node goes out of sync

### Manual resynchronisation

Administration → System → Deployment → select the node → **Syncup**.

This forces a full configuration push from the primary. It resolves most out-of-sync conditions.

**Be aware it's disruptive.** A full sync on a large deployment takes time and puts load on the primary PAN. The node being synced restarts services. Do it in a window if you can.

### Before you reach for Syncup

Check the obvious first, because Syncup on a node with a DNS problem will simply fail again:

**Can the nodes reach each other?** Ping and, more usefully, confirm the replication ports are open.

**Is DNS still correct?** Forward and reverse, from both directions. Addresses change; PTR records get missed.

**Is NTP still in sync?** `show ntp` on both nodes.

**Have certificates expired?** Node communication certificates expire like any other.

**Is the disk full?** A node that can't write can't apply a sync.

```
show disks
show application status ise
```

## Debugging replication

Set these to debug under Operations → Troubleshoot → Debug Wizard:

- `Replication-Deployment` → `replication.log` and `ise-psc.log`
- `Replication-JGroup` → `replication.log` and `ise-psc.log`
- `Replication Tracker` → `tracking.log`
- `hibernate` → `hibernate.log`
- `JMS` → `replication.log`

Then read them:

```
show logging application replication.log tail
show logging application ise-psc.log | include ERROR
```

**JGroup** is the underlying cluster communication layer. Errors there usually mean a network problem between nodes — blocked ports, or intermittent connectivity — rather than an ISE problem.

**Hibernate** is the database layer. Errors there point at the database itself, and often at disk.

That split is useful: JGroup errors send you to the network team, hibernate errors send you to the node.

## Design notes

**Replication traffic needs bandwidth.** Cisco publishes minimum bandwidth requirements between persona pairs. Check them against your actual WAN, particularly for PSNs at remote sites. A link that's adequate for authentication may not be adequate for a full configuration sync.

**Latency matters as much as bandwidth.** A PSN across a high-latency link will sync, but slowly, and it's more susceptible to timeouts during large changes.

**Register nodes in a window.** The node is unavailable during registration, and the primary PAN is busy.

**Don't make large configuration changes while a node is syncing.** Let it settle first.

**Two PANs is the maximum,** and the secondary is a warm standby holding a synchronised copy. It doesn't accept configuration changes until promoted.

## The failure that catches people out

A node that is **out of sync but still authenticating**.

PSNs hold their configuration locally and keep serving RADIUS using whatever policy they last received. So an out-of-sync PSN doesn't stop working — it works using *stale policy*.

The symptom: you change an authorisation rule, test it, and it works. A user on a different floor reports it doesn't. Both are true, because they're hitting different PSNs with different versions of the policy.

This is genuinely hard to diagnose from the symptom, and trivial to diagnose from the Deployment page. Which is why checking node sync state should be an early step whenever policy behaves inconsistently — not a late one.

**Make it a habit:** if two people get different results from the same policy, look at the deployment page before you look at the policy.

---

Replication is invisible when it works and confusing when it doesn't, because nothing stops — it just diverges. Check the sync state early, verify DNS both ways, and remember that a PSN with stale policy is still a PSN that authenticates people incorrectly with complete confidence.
