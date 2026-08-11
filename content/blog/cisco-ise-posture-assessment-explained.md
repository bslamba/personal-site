---
title: "Cisco ISE Posture Assessment: How Compliance Checking Actually Works"
excerpt: "The full posture flow from redirect to compliant, the difference between AnyConnect and temporal agents, how conditions and remediations fit together, and why posture breaks at branch sites."
date: "2025-11-20"
tags: ["Cisco ISE", "Posture", "Compliance", "CoA", "AnyConnect"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **What it does** | Checks endpoint compliance (patches, AV, encryption, running services) *after* authentication, then changes access based on the result. |
| **Three states** | Unknown → Non-Compliant → Compliant. Each maps to its own authorisation profile. |
| **The flow** | Authenticate → limited access + redirect → agent checks → report → **CoA** → compliant access. |
| **Persistent agent** | AnyConnect / Cisco Secure Client ISE Posture module. Installed, survives reboots. |
| **Temporal agent** | Downloaded, runs once, self-deletes. For unmanaged or guest-type endpoints. |
| **Condition** | The thing being checked (file exists, service running, registry key set, AV up to date). |
| **Requirement** | Condition + remediation + OS scope. |
| **Policy** | Which requirements apply to which identity groups and OSes. |
| **Remediation** | What happens on failure — launch a program, run a script, show a message, trigger an update. |
| **Hard dependency** | **CoA.** Also DNS, and the provisioning path being reachable. |
| **Debug** | `posture`, `provisioning` → `ise-psc.log`; `portal`, `client-webapp` → `guest.log`; `runtime-AAA` → `prrt-server.log`; `swiss` → `ise-psc.log` |

---

Authentication answers *who is this*. Posture answers *should this device be allowed on, in the state it's currently in*.

A domain laptop with a valid certificate might be three months behind on patches, running a disabled antivirus, and carrying an unencrypted disk. Authentication passes it without comment. Posture is the control that doesn't.

## The three states

Every endpoint sits in one of three posture states, and each maps to a different authorisation profile.

**Unknown** — ISE has no posture information. Either the agent hasn't reported yet, or it isn't installed. This state gets limited access plus a redirect to the provisioning portal.

**Non-Compliant** — the agent reported and the endpoint failed at least one requirement. This gets limited access, usually with reachability to whatever is needed for remediation — patch servers, AV update servers.

**Compliant** — passed everything. Full access.

The design work is deciding what each state actually permits. Non-compliant access that can't reach the patch server means the endpoint can never become compliant, which is a trap people build accidentally and then wonder why devices sit in remediation forever.

## The full flow

**1. Endpoint authenticates.** 802.1X or MAB, succeeds normally.

**2. Authorisation matches the posture-unknown rule.** ISE returns limited access plus a **redirect URL** and **redirect ACL** — exactly the same mechanism as guest CWA.

**3. The user opens a browser** and is redirected to the Client Provisioning portal.

**4. The agent is provisioned** — either the persistent agent is installed, or the temporal agent is downloaded and run.

**5. The agent performs the checks** defined by the posture policy that applies to this endpoint.

**6. The agent reports the result** back to ISE.

**7. ISE sends CoA.** The session is re-authorised according to the result.

**8. The endpoint lands in compliant or non-compliant access.**

Step seven is the one that fails. If CoA doesn't work, the agent runs, reports compliant, and the user stays in restricted access with no explanation. It's the single most common posture complaint and it's almost never a posture problem.

## Persistent versus temporal agents

**The persistent agent** is the ISE Posture module within Cisco Secure Client (formerly AnyConnect). It installs, stays installed, and runs on every connection. It can perform the full range of checks including registry inspection, file system checks and service status, and it can run remediations automatically.

Use it for managed endpoints, deployed through your normal software distribution rather than through the portal. Provisioning through the portal works, but on a managed estate you should already be pushing it.

**The temporal agent** downloads on demand, runs its checks once, reports, and removes itself. No installation, no administrative rights required for a persistent install.

Use it for endpoints you don't manage — contractor laptops, BYOD devices where you want a compliance gate but can't mandate software. The trade-off is a reduced check set and a fresh download every session.

## Conditions, requirements, policies, remediations

The structure trips people up because four layers is more than it feels like it needs.

**Condition** — the atomic check. "File `pattern.dat` exists and is newer than 7 days." "Service `WinDefend` is running." "Registry key X has value Y." "Antivirus definitions are less than 3 days old."

**Requirement** — a condition, plus the remediation to run if it fails, plus the operating systems it applies to. This is the reusable unit.

**Policy** — which requirements apply to which endpoints, scoped by identity group, operating system and other conditions. "Windows corporate laptops must meet requirements A, B and C."

**Remediation** — what happens on failure. Launch a program, run a script, show a message with a link, trigger an AV update, or simply instruct the user.

The layering pays off at scale: one condition can serve several requirements, one requirement several policies.

## Where posture breaks

### CoA doesn't work

Covered above, and it deserves repeating because it accounts for most of the tickets.

The specific pattern that catches well-run networks: **posture works in the data centre and fails at branch sites.** CoA travels ISE → network device, which is the reverse of normal RADIUS. Every firewall rule anyone wrote was for the normal direction. The branch firewall blocks it, and posture stalls.

Check this first when posture is inconsistent by location.

### The redirect ACL is wrong

Same failure mode as guest. On a switch, `permit` means redirect and `deny` means pass through. DNS and traffic to ISE must be denied — that is, not redirected — or the portal never loads.

The posture ACL also needs to permit whatever the agent needs to *download*, and whatever remediation needs to reach.

### Non-compliant devices can't remediate

The non-compliant authorisation profile must permit access to remediation resources: WSUS or your patch server, antivirus update servers, and any internal software distribution point.

If it doesn't, the endpoint is stuck. It fails, gets restricted access, can't reach what would fix it, and sits there. Users then call the helpdesk, who tell them to reconnect, which changes nothing.

Write the remediation path into the design and test it by deliberately failing a device.

### Stale posture state

Posture results have a lease. When it expires the endpoint returns to unknown and must re-assess. Set the interval deliberately — too short and users see repeated interruption, too long and a device that fell out of compliance keeps full access for days.

### Agent provisioning fails

The Client Provisioning portal must be reachable, its certificate trusted, and its FQDN resolvable. Same requirements as any ISE portal. On endpoints without administrative rights, the persistent agent install fails — which is an argument for pushing it through software distribution rather than relying on the portal.

## Debugging

Set these to debug under Operations → Troubleshoot → Debug Wizard:

- `posture` → `ise-psc.log`
- `provisioning` → `ise-psc.log`
- `portal` → `guest.log`
- `client-webapp` → `guest.log`
- `swiss` → `ise-psc.log`
- `runtime-AAA` → `prrt-server.log`
- `nsf` and `nsf-session` → `ise-psc.log`

`swiss` is the protocol between the agent and ISE, and it's the one to enable when the agent connects but never reports.

Bearing in mind Cisco's guidance that `runtime-AAA` at debug level significantly affects performance and shouldn't stay on for more than about fifteen minutes on a production node.

Also useful:

```
show logging application ise-psc.log tail
show logging application guest.log tail
```

### A sequence that works

1. **Live Logs** — what posture status did ISE record, and which authorisation profile was applied?
2. If status is **Unknown** and stays unknown, the agent isn't reporting. Check provisioning and the redirect ACL.
3. If status went **Compliant** but access didn't change, it's CoA.
4. If status is **Non-Compliant**, open the detailed report — it names the specific requirement that failed.
5. On the endpoint, the agent's own UI shows which check failed and why. Users can usually read this to you over the phone, and it saves a lot of guessing.

## Designing something people can live with

**Start in audit mode.** Assess, record, but authorise everyone the same regardless of result. Run it for weeks and look at the failure rate. If 40% of your estate fails a check, you have a patching problem to solve before you have a posture policy to enforce.

**Check things that matter.** Every additional check is another way for a legitimate endpoint to be blocked. Disk encryption, antivirus running and current, OS patch level. Resist the urge to check everything possible.

**Write clear remediation messages.** The message a user sees when they fail is the entire user experience of posture. "Non-compliant" is useless. "Your antivirus definitions are out of date. Click here to update, then reconnect" is actionable.

**Test the unhappy path.** Deliberately fail a device and walk through remediation as a user would. This is where you discover the remediation server isn't reachable from the non-compliant profile.

**Have an exception process.** There will be a device that can't comply and can't be replaced this quarter. Better to have a documented, time-limited exception than an undocumented permanent bypass someone added at 2am.

---

Posture is the control that turns network access from a question of identity into a question of hygiene. Done well, it quietly raises the security floor of every device on the network. Done badly, it's the reason people describe NAC as something that stops them working.

The difference is almost entirely in the design of the non-compliant state — whether it's a path back to compliance, or a dead end.
