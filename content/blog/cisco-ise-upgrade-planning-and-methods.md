---
title: "Planning a Cisco ISE Upgrade: Methods, Node Order and What Goes Wrong"
excerpt: "Backup-restore versus in-place versus the upgrade wizard, the order nodes must be upgraded in, the pre-checks that catch problems before they become outages, and a rollback plan you can actually execute."
date: "2026-03-05"
tags: ["Cisco ISE", "Upgrade", "Change Management", "Operations"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Node order** | Secondary PAN first → PSNs → Secondary MnT → Primary MnT → **Primary PAN last** |
| **Why that order** | The secondary PAN becomes the new primary during the process, so the deployment always has an administration node on a known version. |
| **Methods** | Upgrade wizard (GUI) · CLI `application upgrade` · Backup-and-restore onto fresh nodes |
| **Backup-restore** | Cleanest result, most work. Effectively a rebuild. Preferred for large version jumps. |
| **Pre-check** | Run the **Upgrade Readiness Tool (URT)** on the secondary PAN before anything else. |
| **Non-negotiable** | Configuration backup + operational backup, **restored and verified somewhere**, before starting. |
| **Certificates** | Check expiry across every node. An upgrade is a terrible time to discover an expired EAP certificate. |
| **Repository** | Configure and test the repository before the window, not during it. |
| **Rollback** | Realistically: restore from backup onto reimaged nodes. Plan the time for it. |

---

An ISE upgrade is a change to the system that authenticates every device on your network. Done well it's uneventful. Done badly it's the kind of outage that gets discussed at board level, because nobody can connect to anything.

The good news is that almost every failure is preventable with pre-checks that take an afternoon.

## The three methods

### Upgrade wizard

The GUI-driven approach. You select the target version, the wizard handles node sequencing, and it reports progress.

Convenient, and the right choice for straightforward hops between adjacent versions on a healthy deployment. Less useful when something goes wrong mid-way, because the wizard's error reporting is not always specific enough to act on.

### CLI upgrade

```
application upgrade prepare <bundle> <repository>
application upgrade proceed
```

Node by node, under your control. More work, more visibility. When an upgrade fails at 2am, having done it node by node means you know exactly where you are.

The `prepare` step stages the bundle locally first, which matters — you don't want a large download happening during the maintenance window.

### Backup and restore onto fresh nodes

Build new nodes on the target version, restore the configuration backup, and cut over.

**The most work and the cleanest result.** You're not carrying forward accumulated state, failed patches, or whatever has quietly gone wrong over three years of operation.

**When it's the right answer:**
- Large version jumps where a direct upgrade path isn't supported
- A deployment that's been upgraded repeatedly and feels fragile
- Moving from physical to virtual, or resizing
- Any case where you want a genuine rollback option — the old nodes are still there, untouched

The rollback property is the strongest argument. With in-place upgrades, rolling back means reimaging and restoring. With fresh nodes, it means pointing the network devices back at the old ones.

## The node order, and why it matters

**Secondary PAN → PSNs → Secondary MnT → Primary MnT → Primary PAN.**

The reasoning: when you upgrade the secondary PAN, it becomes the primary for the upgraded portion of the deployment. That means administration capability exists throughout, on a node whose version you know.

The primary PAN goes last because it holds the authoritative configuration until the moment the deployment is fully migrated.

**PSNs in the middle, and in groups.** Never all at once. Upgrade a subset, verify authentication works through them, then continue. In a large deployment, do them in waves matched to your redundancy — if switches have two PSNs configured, never upgrade both at the same time.

**This is the practical requirement that makes upgrades survivable:** your network devices must have more than one PSN in their RADIUS server group. If a switch knows about exactly one PSN, upgrading it is an outage for everything behind that switch. Check this *before* the upgrade window, because fixing it is a network change, not an ISE change.

## Pre-checks worth an afternoon

### 1. Run the Upgrade Readiness Tool

The URT runs on the secondary PAN and validates the deployment for known upgrade blockers — schema issues, data problems, unsupported configurations.

Run it early, not on the night. It frequently finds something, and the fixes are often not quick.

### 2. Verify backups by restoring one

A backup you haven't restored is a hypothesis.

Take a configuration backup and an operational backup. Then restore the configuration backup onto a spare node or a lab instance and confirm it actually works. This is the single highest-value hour in the entire exercise.

### 3. Check every certificate

Across every node: system certificates, the EAP authentication certificate, portal certificates, admin certificates, and the CA chain in the trust store.

An upgrade window is the worst possible time to discover an expired certificate, because now you have two problems and no way to tell which caused the symptom.

### 4. Confirm the repository works

Configure the repository and test it with an actual file transfer before the window. Repository authentication failures are a common cause of an upgrade that stalls at the first step.

### 5. Record the current state

Before you start, capture:

- `show version` on every node
- `show application status ise` on every node
- Current authentication rate and active session count
- A screenshot of Live Logs looking healthy

You need a baseline to compare against afterwards. "It seems slower" is unactionable; "authentication latency went from 40ms to 400ms" is a diagnosis.

### 6. Confirm licence entitlement

Check licences cover the target version, and that you have the UDI details recorded for every node — Product ID, Version ID and Serial Number. Retrieving a UDI from a node that won't boot is a bad afternoon.

### 7. Check disk space

Particularly on the MnT nodes. Upgrades need working room, and MnT is the node most likely to be near capacity.

## During the upgrade

**Verify at each stage, don't just proceed.** After each node completes:

```
show application status ise
```

Every service should be running. Then test an actual authentication through an upgraded PSN before moving on — not just that the node is up, but that a real endpoint authenticates through it.

**Watch the logs:**

```
show logging system ade/ADE.log tail
```

Application start and stop events appear here. If a service fails to start after upgrade, this is where it says so.

**Keep a channel open with whoever is testing.** The person watching ISE and the person plugging a laptop into a switch should be talking to each other continuously.

## What goes wrong

**Certificate expiry discovered mid-upgrade.** Prevented by pre-check 3.

**A PSN that won't rejoin the deployment.** Usually certificate or DNS. The node upgrades fine and then can't re-register. Check name resolution from the node and the certificate chain.

**Replication not converging.** Nodes show as out of sync after the upgrade. Give it time first — replication after an upgrade genuinely takes a while on a large deployment. If it persists, enable `Replication-Deployment` and `Replication-JGroup` debug and read `replication.log`.

**Authentication works, authorisation doesn't.** Policy migrated but something in the conditions changed semantics between versions. This is why you test real authentications, not just node status.

**Performance degraded afterwards.** Often debug logging left enabled from troubleshooting during the window. Check debug levels are back to default — and remember that using "Reset to Default" while a Debug Profile is enabled leaves the template active while the components revert, so disable templates properly.

**AD join lost.** The node upgrades and is no longer joined. Rejoin, and check that the machine account password hadn't rotated.

## Rollback

Be honest about what rollback means, because "we'll roll back if there's a problem" is often said and rarely planned.

**In-place upgrade:** rollback means reimaging the node to the previous version and restoring the configuration backup. That is hours per node, not minutes. If your maintenance window is four hours and rollback takes six, you don't have a rollback plan — you have a hope.

**Backup-and-restore onto new nodes:** rollback means repointing network devices at the old nodes, which are still running. Minutes. This is the strongest practical argument for the method.

**Decide the abort point in advance.** "If we are not through the PSNs by 03:00, we stop and roll back." Written down, agreed before the window, and enforced by someone who isn't the person doing the work. The failure mode is always pressing on because you're nearly there.

## After the upgrade

**Test the full matrix.** Wired 802.1X, wireless 802.1X, MAB, guest, BYOD, posture, TACACS+ device administration. Each of those paths can break independently.

**Check CoA specifically.** It's the dependency that everything advanced relies on, and it fails silently.

**Compare against the baseline** you captured in pre-check 5.

**Confirm every debug is off.**

**Take a fresh backup** on the new version.

**Leave the change record open for a week.** Some problems only surface with a full business cycle — the monthly batch job, the contractor who visits on Thursdays, the certificate that renews at month end.

---

The determining factor in whether an ISE upgrade goes well is almost never the upgrade itself. It's whether the pre-checks were done, whether the network devices have redundant PSNs configured, and whether the rollback plan is executable within the window. All three are decided before the night begins.
