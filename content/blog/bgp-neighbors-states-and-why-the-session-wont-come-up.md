---
title: "BGP Neighbours: The Six States, eBGP vs iBGP, and Why Your Session Says Active"
excerpt: "BGP does not find neighbours — you tell it about them, one at a time, and it opens a TCP session. Here is the state machine, what each state means when you are stuck in it, the rules that differ between eBGP and iBGP, and a checklist that finds the fault in under a minute."
date: "2026-09-20"
tags: ["BGP", "eBGP", "iBGP", "Routing", "CCNP", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.2.c *Configure and verify eBGP between directly connected neighbors (best path selection algorithm and neighbor relationships)*. ENARSI 300-410 — 1.11.b *Neighbor relationship and authentication (next-hop, multihop, 4-byte AS, private AS, route refresh, synchronization, operation, peer group, states and timers)*.
>
> **Part 1 of 2.** This one is the session. [Part 2 is how BGP chooses between paths](/blog/bgp-best-path-selection-the-tie-breakers-in-order).

## Cheat sheet

| | |
|---|---|
| **Transport** | TCP **179**. The higher IP address initiates; both may try. |
| **Type** | Path vector. Carries the full list of autonomous systems a route crossed. |
| **eBGP** | Between different AS numbers. AD **20**. TTL **1** by default. |
| **iBGP** | Within one AS. AD **200**. TTL 255. |
| **States** | Idle → Connect → OpenSent → OpenConfirm → Established. **Active** is the retry state, not a healthy one. |
| **Messages** | Open, Update, Keepalive, Notification, Route-Refresh. |
| **Timers** | Keepalive 60s, Hold 180s. The lower of the two Open values wins. |
| **eBGP loop check** | Sees its own AS in AS_PATH → discard. |
| **iBGP loop check** | Split horizon: a route from an iBGP peer is never sent to another iBGP peer. |
| **Consequence** | iBGP needs a full mesh, or a route reflector. |
| **next-hop-self** | iBGP does not rewrite next hop. Usually you must. |
| **Authentication** | TCP MD5 via `neighbor x.x.x.x password`. |

---

## BGP is not a routing protocol in the way the others are

OSPF and EIGRP discover neighbours by shouting into the link — multicast hellos, and anyone listening who agrees on the parameters becomes an adjacency. They then exchange topology and compute the best path from it.

BGP does none of that.

You configure every neighbour by hand, by address and AS number. There is no discovery. It then opens an ordinary **TCP session on port 179** and speaks over it. And what it exchanges is not topology — it is *reachability plus attributes*: "I can reach 203.0.113.0/24, here is the list of autonomous systems it passed through, here is where to send it, here is what I think of it."

<div class="why">
<b>Why this design</b>
BGP was built to connect organisations that do not trust each other and do not share a topology database. An ISP will not tell you its internal link costs, and you would not believe them anyway. So BGP carries <em>policy</em> — attributes you set to express business relationships — and picks paths by those, not by speed. A BGP route can be slower and still win because somebody decided it should. Every strange thing about BGP follows from this.
</div>

Because it runs over TCP, BGP inherits TCP's properties for free: ordered delivery, retransmission, and a session that stays up until something breaks it. It also inherits TCP's requirements — **you must have IP reachability to the neighbour address before BGP can do anything at all.** That single fact resolves most "BGP won't come up" cases.

---

## The state machine

<figure class="fig">
<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BGP finite state machine from Idle through to Established">
  <style>
    .b { fill:#fff; stroke:#232327; stroke-width:1.5 }
    .bad { fill:#D3002D; stroke:#D3002D } .ok { fill:#1f9d6b; stroke:#1f9d6b }
    .t { font-family:ui-sans-serif,system-ui; font-size:11.5px; font-weight:700; fill:#17171A }
    .tw { font-family:ui-sans-serif,system-ui; font-size:11.5px; font-weight:700; fill:#fff }
    .s { font-family:ui-sans-serif,system-ui; font-size:9.5px; fill:#5C5C64 }
    .ar { stroke:#8A8A93; stroke-width:1.5; fill:none; marker-end:url(#h) }
    .arb { stroke:#D3002D; stroke-width:1.5; fill:none; marker-end:url(#hr); stroke-dasharray:5 4 }
  </style>
  <defs>
    <marker id="h" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker>
    <marker id="hr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#D3002D"/></marker>
  </defs>
  <rect class="b" x="10" y="76" width="82" height="34" rx="3"/><text class="t" x="51" y="98" text-anchor="middle">Idle</text>
  <line class="ar" x1="94" y1="93" x2="122" y2="93"/>
  <rect class="b" x="124" y="76" width="92" height="34" rx="3"/><text class="t" x="170" y="98" text-anchor="middle">Connect</text>
  <line class="ar" x1="218" y1="93" x2="246" y2="93"/>
  <rect class="b" x="248" y="76" width="96" height="34" rx="3"/><text class="t" x="296" y="98" text-anchor="middle">OpenSent</text>
  <line class="ar" x1="346" y1="93" x2="374" y2="93"/>
  <rect class="b" x="376" y="76" width="112" height="34" rx="3"/><text class="t" x="432" y="98" text-anchor="middle">OpenConfirm</text>
  <line class="ar" x1="490" y1="93" x2="518" y2="93"/>
  <rect class="b ok" x="520" y="76" width="110" height="34" rx="3"/><text class="tw" x="575" y="98" text-anchor="middle">Established</text>
  <rect class="b bad" x="124" y="168" width="92" height="32" rx="3"/><text class="tw" x="170" y="189" text-anchor="middle">Active</text>
  <path class="arb" d="M170,112 L170,166"/>
  <path class="arb" d="M196,166 C240,140 150,120 176,114"/>
  <text class="s" x="228" y="186">TCP failed · retrying · this is the one you will see</text>
  <text class="s" x="51" y="128" text-anchor="middle">admin down</text>
  <text class="s" x="170" y="62" text-anchor="middle">TCP opening</text>
  <text class="s" x="296" y="62" text-anchor="middle">Open sent, waiting</text>
  <text class="s" x="432" y="62" text-anchor="middle">Open OK, awaiting</text>
  <text class="s" x="432" y="50" text-anchor="middle">keepalive</text>
  <text class="s" x="575" y="62" text-anchor="middle">Updates flow</text>
  <text class="s" x="575" y="128" text-anchor="middle">healthy</text>
</svg>
<figcaption><b>Figure 1.</b> The happy path runs left to right. Any failure drops back to Idle; a failed TCP connection lands in Active, which retries. A session flapping between Connect and Active is a transport problem, not a BGP problem.</figcaption>
</figure>

| State | What is happening | What it means if you are stuck here |
|---|---|---|
| **Idle** | Refusing connections. Start, or after an error. | The neighbour is administratively shut, or there is no route to its address at all. Check `show ip route <neighbour>`. |
| **Connect** | Waiting for the TCP three-way handshake to finish. | Rarely seen — it passes through quickly. |
| **Active** | The TCP connection **failed**, and BGP is retrying. | **The most misread state in networking.** "Active" sounds healthy. It means the opposite. See below. |
| **OpenSent** | Open message sent, waiting for theirs. | Their Open never arrived, or it was rejected. Usually a wrong AS number or a version mismatch. |
| **OpenConfirm** | Their Open was accepted; waiting for a keepalive. | Almost always transient. Persisting here suggests authentication failing one way. |
| **Established** | The session is up. Updates flow. | Healthy. `show ip bgp summary` shows a prefix count instead of a state name. |

<div class="warn">
<b>Active means broken</b>
Every engineer misreads this once. In <code>show ip bgp summary</code>, the State/PfxRcd column shows a <em>number</em> when the session is up — the count of prefixes received. It shows a <em>word</em> when it is down. If you see <code>Active</code>, BGP is actively <b>trying and failing</b> to open a TCP session. The cause is almost always one of: no route to the neighbour address, an ACL or firewall blocking TCP 179, the wrong neighbour address configured, or the far end has no matching neighbour statement.
</div>

### The five message types

| Message | Purpose |
|---|---|
| **Open** | Version, my AS, hold time, BGP identifier, capabilities. Sent once per session. |
| **Update** | Prefixes advertised with their attributes, and prefixes withdrawn. The only message carrying routes. |
| **Keepalive** | Every 60s by default. Keeps the hold timer from expiring. |
| **Notification** | An error. **Always tears the session down.** The code and subcode tell you exactly what went wrong. |
| **Route-Refresh** | "Resend me everything." Lets policy change without clearing the session. |

---

## eBGP and iBGP are the same protocol with different rules

The distinction is made by one thing only: whether the AS number in your `neighbor remote-as` statement matches your own.

| | eBGP | iBGP |
|---|---|---|
| AS numbers | Different | Same |
| Administrative distance | **20** | **200** |
| Default TTL on packets | **1** | 255 |
| Next hop when advertising | Rewritten to self | **Unchanged** |
| AS_PATH when advertising | Own AS prepended | Unchanged |
| Loop prevention | Reject if own AS is in AS_PATH | Split horizon: never re-advertise between iBGP peers |
| Typical peering address | Physical interface | **Loopback** |

Three of those rows cause nearly every iBGP problem people hit.

### TTL 1, and why eBGP wants a physical address

eBGP sends its packets with **TTL 1**. The assumption is that your eBGP peer is directly attached — one hop away — so a TTL of 1 is enough, and anything further away is presumed to be spoofed. This is a security feature.

Peer to a loopback across two hops and the packets die in transit. Two fixes:

```cisco
! Allow the session to survive more hops
neighbor 203.0.113.9 ebgp-multihop 2

! Or, better, require the packets to ARRIVE with a high TTL (GTSM, RFC 5082)
neighbor 203.0.113.9 ttl-security hops 2
```

`ttl-security` is the stronger of the two: it sends with TTL 255 and demands that arriving packets have at least 255 − hops, which an attacker further away cannot fake.

### iBGP does not change the next hop

When an iBGP router passes a route to another iBGP router, it leaves the **next hop as the original eBGP peer's address**. That address is outside your AS, and your internal routers usually have no route to it. The path is therefore unreachable and BGP marks it inaccessible — the route appears in `show ip bgp` but never makes it into the routing table.

```cisco
router bgp 65001
 neighbor 10.0.0.2 remote-as 65001
 neighbor 10.0.0.2 update-source Loopback0
 neighbor 10.0.0.2 next-hop-self      ! ← rewrite it to my loopback
```

<div class="note">
<b>The symptom to recognise</b>
<code>show ip bgp</code> lists the prefix, but with no <code>&gt;</code> (best) marker, and <code>show ip bgp 203.0.113.0</code> says <b>inaccessible</b>. That is next hop, every time. Either add <code>next-hop-self</code>, or carry the external subnet in your IGP — the first is almost always right.
</div>

### iBGP split horizon, and the full mesh it forces

To prevent loops inside an AS — where AS_PATH cannot help, because the path never leaves the AS — iBGP uses a blunt rule: **a route learned from an iBGP peer is never advertised to another iBGP peer.**

The consequence is that every iBGP speaker must peer with every other one. That is *n(n−1)/2* sessions: 10 routers need 45 sessions; 20 routers need 190. It does not scale.

The fix is a **route reflector**, which is explicitly permitted to break the rule and reflect routes between clients. Clients need only peer with the reflector.

```cisco
! On the reflector
router bgp 65001
 neighbor 10.0.0.2 route-reflector-client
 neighbor 10.0.0.3 route-reflector-client
```

Loop prevention then falls to two attributes the reflector adds: **ORIGINATOR_ID** (who first announced it, so that router ignores it coming back) and **CLUSTER_LIST** (which reflectors it has passed, so a reflector seeing its own cluster ID discards it).

<details class="reveal">
<summary>Why not just peer everything with everything?</summary>

Beyond the session count, each iBGP session is a full TCP connection with its own state, and every prefix must be sent across every session. At internet scale — around a million prefixes — a full mesh of 20 routers means holding and transmitting that table 19 times from each router. Route reflectors cut it to one session per client and one copy per reflector.

The trade-off: a reflector only passes on **its own best path**, not every path it knows. Clients therefore see fewer options than a full mesh would give them, which can cause suboptimal routing. This is why reflectors are usually deployed in redundant pairs, and why `bgp additional-paths` exists.
</details>

---

## Configuration

```cisco
! ===== eBGP to a provider, directly connected =====
router bgp 65001
 bgp router-id 10.0.0.1
 bgp log-neighbor-changes

 neighbor 203.0.113.9 remote-as 64500
 neighbor 203.0.113.9 description ISP-A primary transit
 neighbor 203.0.113.9 password 7 <shared-secret>
 neighbor 203.0.113.9 timers 10 30

 address-family ipv4 unicast
  neighbor 203.0.113.9 activate
  neighbor 203.0.113.9 soft-reconfiguration inbound
  network 198.51.100.0 mask 255.255.255.0
 exit-address-family
```

```cisco
! ===== iBGP to an internal router, loopback to loopback =====
router bgp 65001
 neighbor 10.0.0.2 remote-as 65001
 neighbor 10.0.0.2 update-source Loopback0
 address-family ipv4 unicast
  neighbor 10.0.0.2 activate
  neighbor 10.0.0.2 next-hop-self
 exit-address-family
```

Four lines deserve explanation.

**`bgp router-id`** — pin it. BGP picks the highest loopback otherwise, and the ID changes if that interface goes away, which resets sessions. It also breaks the final best-path tie-breaker in an unpredictable way.

**`update-source Loopback0`** — the source address of BGP's packets must match what the neighbour expects. Peer to a loopback and you must source from a loopback, or the far end sees packets from an address it has no neighbour statement for and refuses them. This has to be configured on **both** ends.

**`network 198.51.100.0 mask 255.255.255.0`** — in BGP this does *not* mean "run BGP on this interface" as it does in OSPF. It means "advertise this prefix, **if an exactly matching route already exists in my routing table**". The mask must match exactly. A `/24` in the table will not be advertised by a `network` statement for a `/23`.

**`soft-reconfiguration inbound`** — stores the neighbour's unmodified updates so you can change inbound policy and re-apply it without tearing down the session. Costs memory. The modern alternative is route refresh, which is negotiated automatically and needs no configuration — check with `show ip bgp neighbors | include Route refresh`.

### Reading the summary

```text
R1# show ip bgp summary
BGP router identifier 10.0.0.1, local AS number 65001
BGP table version is 42, 12 network entries using 2976 bytes of memory

Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.0.0.2        4 65001    1893    1901       42    0    0 1d04h           8
10.0.0.3        4 65001       0       0        1    0    0 never    Active
203.0.113.9     4 64500   14022   13998       42    0    0 02:14:19        4
203.0.113.13    4 64501      12      14        1    0    0 00:00:31    OpenSent
```

Four neighbours, three distinct stories:

- **10.0.0.2** — a number in the last column, so Established, receiving 8 prefixes. Up over a day. Healthy.
- **10.0.0.3** — `Active`, `never` came up, zero messages either way. TCP is not completing. Check routing to 10.0.0.3 and whether the far end has a matching `neighbor` statement.
- **203.0.113.9** — up 2 hours 14 minutes, 4 prefixes. Fine, but note the uptime: if that keeps resetting to minutes, the session is flapping.
- **203.0.113.13** — `OpenSent`, messages sent but the session is not forming. Their Open is missing or rejected. **Check the AS number on both sides first** — a wrong `remote-as` produces exactly this.

---

## The checklist that finds it

Work down. Each step is one command and eliminates a whole class of fault.

1. **Can you reach the neighbour address at all?**
   `ping <neighbour> source <your update-source>`
   Sourcing matters. A ping that works from the physical interface but fails from the loopback is the fault itself.

2. **Is there a route to it?**
   `show ip route <neighbour>` — Idle with no route is the commonest cause of all.

3. **Is TCP 179 getting through?**
   `show tcp brief | include 179`. No entry means nothing is listening or something is filtering. Check ACLs on the path and on the interface.

4. **Do the AS numbers agree?**
   Yours in their `remote-as`, theirs in yours. A mismatch gives OpenSent, and `debug ip bgp` reports the notification.

5. **Do the source addresses agree?**
   If they peer to your loopback, you need `update-source`. Both ends.

6. **Is it more than one hop, on eBGP?**
   Then `ebgp-multihop` or `ttl-security` is required.

7. **Does authentication match?**
   `show ip bgp neighbors <x> | include password`. A mismatch is silent at BGP level — look for `%TCP-6-BADAUTH` in the log.

8. **Established but no routes?**
   Different problem entirely. Check `next-hop-self`, whether the prefix exists in the routing table exactly as the `network` statement claims, and whether a route-map is filtering it. `show ip bgp neighbors <x> received-routes` needs soft-reconfiguration or route refresh.

---

<div class="lab">
<div class="lab-head">Lab — build both session types and break each one on purpose</div>
<div class="lab-body">

**Build:** three routers. R1 (AS 65001) and R2 (AS 65001) internal, connected via a transit link. R3 (AS 64500) attached to R1 as an external peer. Loopback0 on each, advertised into an IGP between R1 and R2 only.

**Task 1 — eBGP, directly connected.**
Peer R1 to R3 on the physical link addresses. Confirm `Established` and note the prefix count. Run `show ip bgp neighbors 203.0.113.9 | include TTL|hops` and find the TTL behaviour.

**Task 2 — watch Active happen.**
On R3, remove the `neighbor` statement for R1. On R1, `clear ip bgp *` and watch the state. Record what `show ip bgp summary` shows and how long it stays there. Put it back.

**Task 3 — iBGP with the next-hop trap.**
Peer R1 to R2, loopback to loopback, with `update-source` but deliberately **without** `next-hop-self`. Advertise R3's prefix into BGP from R1. On R2, run `show ip bgp` and `show ip route`. The prefix should appear in the BGP table but not the routing table. Run `show ip bgp <prefix>` and find the word **inaccessible**.

**Task 4 — fix it two ways.**
First add `next-hop-self` on R1 and confirm the route installs. Then remove it and instead advertise R1–R3's link subnet into the IGP. Confirm the route installs again. Note which fix you would use in production and why.

**Task 5 — break the TTL.**
Move the R1–R3 peering to loopbacks without `ebgp-multihop`. Watch it fail. Add `ebgp-multihop 2` and watch it recover. Then swap to `ttl-security hops 2` and confirm it still works.

**Task 6 — authentication mismatch.**
Set `neighbor ... password CISCO` on one side only. Watch the session drop. Find `%TCP-6-BADAUTH` in `show logging`. Note that `show ip bgp summary` alone does **not** tell you this is the cause.

**Task 7 — capture the Open.**
Mirror the R1–R3 link to a machine running Wireshark and filter on `bgp`. Clear the session. In the Open message find: version 4, the sender's AS, the hold time, the BGP identifier, and the capabilities list. Confirm the negotiated hold time is the lower of the two configured values.

**Record:** your `show ip bgp summary` at each failure, and the Open message capture from Task 7.

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span><code>show ip bgp summary</code> shows a neighbour in state <code>Active</code>. What does that tell you?</p>
<label class="qz-opt"><input type="radio" name="bn1"><span>The session is up and actively exchanging routes</span><em class="qz-fb qz-bad">A healthy session shows a prefix <em>count</em>, not a state word. Active is a failure state.</em></label>
<label class="qz-opt"><input type="radio" name="bn1"><span>The TCP session failed and BGP is retrying</span><em class="qz-fb qz-good">Correct. Check routing to the neighbour address, filtering on TCP 179, and whether the far end has a matching neighbour statement.</em></label>
<label class="qz-opt"><input type="radio" name="bn1"><span>The neighbour is administratively shut down</span><em class="qz-fb qz-bad">That produces Idle, not Active.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A prefix appears in <code>show ip bgp</code> on an iBGP router but never reaches the routing table, and the entry reads <em>inaccessible</em>. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="bn2"><span>The AS_PATH contains the local AS</span><em class="qz-fb qz-bad">That causes the route to be discarded on receipt, not held as inaccessible.</em></label>
<label class="qz-opt"><input type="radio" name="bn2"><span>The next hop is the external peer's address, which this router cannot reach</span><em class="qz-fb qz-good">Yes. iBGP does not rewrite the next hop. Fix with next-hop-self on the advertising router, or carry the external subnet in the IGP.</em></label>
<label class="qz-opt"><input type="radio" name="bn2"><span>Administrative distance 200 is too high to install</span><em class="qz-fb qz-bad">AD only decides between sources for the same prefix; it does not stop installation on its own.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Why does iBGP need a full mesh or a route reflector?</p>
<label class="qz-opt"><input type="radio" name="bn3"><span>Because AS_PATH cannot detect loops inside a single AS, so iBGP never re-advertises between iBGP peers</span><em class="qz-fb qz-good">Exactly. The path never leaves the AS, so AS_PATH does not grow. Split horizon takes its place, and a reflector is the sanctioned exception using ORIGINATOR_ID and CLUSTER_LIST.</em></label>
<label class="qz-opt"><input type="radio" name="bn3"><span>Because iBGP has an administrative distance of 200</span><em class="qz-fb qz-bad">AD is unrelated to the advertisement rule.</em></label>
<label class="qz-opt"><input type="radio" name="bn3"><span>Because iBGP sessions use TTL 1</span><em class="qz-fb qz-bad">That is eBGP. iBGP uses TTL 255.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>You configure <code>network 198.51.100.0 mask 255.255.254.0</code> but the prefix is never advertised. The router has 198.51.100.0/24 in its routing table. Why?</p>
<label class="qz-opt"><input type="radio" name="bn4"><span>BGP needs the interface to be up first</span><em class="qz-fb qz-bad">True but not the issue here — a matching route already exists, just not a matching one.</em></label>
<label class="qz-opt"><input type="radio" name="bn4"><span>The network statement must match a route in the table exactly, prefix and mask</span><em class="qz-fb qz-good">Right. A /23 statement will not pick up a /24 route. Either change the mask to match, or create the /23 with a static route to Null0.</em></label>
<label class="qz-opt"><input type="radio" name="bn4"><span>You must redistribute connected instead</span><em class="qz-fb qz-bad">Redistribution works but is not why this failed, and it brings in more than you intended.</em></label>
</div>

---

## References

- **RFC 4271** — A Border Gateway Protocol 4 (BGP-4). The state machine is §8.
- **RFC 4456** — BGP Route Reflection. ORIGINATOR_ID and CLUSTER_LIST.
- **RFC 5082** — The Generalized TTL Security Mechanism (GTSM).
- **RFC 6793** — BGP Support for Four-Octet AS Number Space.
- **RFC 2918** — Route Refresh Capability for BGP-4.
- Cisco — [BGP Case Studies](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/26634-bgp-toc.html)
- Cisco — [Troubleshoot BGP Neighbor States](https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/22166-bgp-troubleshoot.html)

---

**Next:** [BGP best path selection — the tie-breakers in order](/blog/bgp-best-path-selection-the-tie-breakers-in-order).

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
