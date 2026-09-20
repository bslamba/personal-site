---
title: "BGP Neighbours: The Six States, eBGP vs iBGP, and Why Your Session Says Active"
excerpt: "BGP does not find neighbours — you tell it about them, one at a time, and it opens a TCP session. Here is the state machine, what each state means when you are stuck in it, the rules that differ between eBGP and iBGP, and a checklist that finds the fault in under a minute."
date: "2026-09-14"
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

## BGP, one by one

BGP is the protocol that runs between autonomous systems — it chooses paths by **policy**, not by speed, and it never forms a neighbour by accident. These are the blueprint sub-items.

### Address families (IPv4, IPv6)

BGP is **multiprotocol**: one TCP session between two routers can carry many **address families** — IPv4 unicast, IPv6 unicast, VPNv4/VPNv6 (for [MPLS L3VPN](/blog/mpls-lsr-ldp-label-switching-and-l3vpn)), and more — each negotiated and advertised separately.

- **Beginner:** one BGP peering can carry both IPv4 and IPv6 (and VPN) routes.
- **Working knowledge:** each family is activated per-neighbour (`address-family ipv6 unicast` → `neighbor X activate`); a neighbour that is *configured* but not *activated* for a family exchanges nothing in it — a common "the session is up but no routes" cause.
- **Pro:** the session and the families are independent — the TCP peering can be up (state Established) while a given address family carries nothing because it was never activated or is filtered. Always check the family, not just the session.

### Neighbor relationship and authentication

BGP peers are **manually configured** (never discovered) and run over **TCP 179**, so the underlying IP reachability to the neighbor address must exist first. **eBGP** is between different AS numbers (default TTL 1 — directly connected, unless `ebgp-multihop`); **iBGP** is within one AS. Sessions can be **authenticated** with MD5.

- **Beginner:** you tell each router exactly who its BGP neighbours are; they don't find each other.
- **Working knowledge:** the giveaways — session stuck in **Active** means TCP is not completing (reachability, ACL, or wrong `remote-as`/address); **Idle** can mean no route to the peer. Key concepts here include **next-hop** handling (iBGP does not change next-hop by default → `next-hop-self`), **multihop** for non-adjacent eBGP, **4-byte AS**, **private AS** removal, **route refresh**, **peer groups/templates**, and the **timers**.
- **Pro:** **iBGP needs a full mesh or a [route reflector](#route-reflector)** because an iBGP router does not re-advertise iBGP-learned routes to other iBGP peers (loop prevention). That single rule explains most "iBGP route not propagating" problems. The state machine is walked in [The state machine](#the-state-machine).

### Path preference (attributes and best-path)

BGP has no metric; it runs a **best-path algorithm** over **attributes**, in order. The ones that decide almost everything, highest priority first: **Weight** (Cisco, local to the router) → **Local Preference** (AS-wide, for outbound choice) → locally originated → **AS-Path length** → **Origin** → **MED** (influences inbound from a neighbour AS) → eBGP over iBGP → lowest IGP metric to next-hop → oldest/router-ID tie-breakers.

- **Beginner:** BGP picks the "best" path using a ranked list of attributes, not by speed.
- **Working knowledge:** to influence **outbound** traffic use **Local Preference** (higher wins); to influence **inbound** use **AS-Path prepending** or **MED** (blunter, and only relative to one neighbour). Weight is the biggest hammer but only on one router.
- **Pro:** the mnemonic *We Love Oranges AS Oranges Mean Pure Refreshment* (Weight, LocalPref, Originate, AS-path, Origin, MED, Paths eBGP>iBGP, Reachability/IGP…) is worth memorising because the **order** is the whole game — a shorter AS-path loses to a higher Local Preference every time. Full treatment in [BGP best-path selection](/blog/bgp-best-path-selection-the-tie-breakers-in-order).

### Route reflector

Because iBGP will not re-advertise iBGP routes, a full mesh needs n(n−1)/2 sessions. A **route reflector (RR)** breaks that rule safely: clients peer only with the RR, and the RR **reflects** their routes to each other, so you scale iBGP without a full mesh.

- **Beginner:** a central iBGP router that relays routes between the others, so they don't all need to peer with each other.
- **Working knowledge:** RR **clients** need no special config; the RR is configured with `neighbor X route-reflector-client`. Loop prevention uses the **originator-ID** and **cluster-list** attributes instead of AS-path (which does not change within an AS).
- **Pro:** RR placement should follow the **physical topology** so the reflected best path is also the physically sensible one — an RR that is not in the forwarding path can reflect a best path that is suboptimal to forward on. (Confederations are the alternative; out of scope here.)

### Policies (inbound/outbound filtering, path manipulation)

BGP is a **policy** protocol: you filter and reshape what you advertise and accept with **prefix-lists**, **AS-path filters**, **communities**, and **route-maps** applied **inbound or outbound** per neighbour.

- **Beginner:** you control exactly which routes go out and come in, and you can nudge which path is chosen.
- **Working knowledge:** **outbound** policy controls what you advertise (and thus influences a neighbour's inbound); **inbound** policy controls what you accept and lets you set Local Preference/Weight to steer your own outbound. Changing policy needs a `clear ip bgp X soft` to take effect.
- **Pro:** **communities** are the scalable lever — tag routes on ingress and act on the tag everywhere else, instead of maintaining prefix-lists per neighbour. And every route-map ends in an implicit **deny**, so a policy that sets an attribute must end with a permit clause or it silently drops everything it did not match. See [route maps](/blog/route-maps-loop-prevention-and-summarisation).

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

<div class="walk">
<div class="walk-head">The six states, and where each one gets stuck <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="bgpw" id="bg1" checked><label for="bg1"><span class="step-n">1</span>Idle</label>
  <input type="radio" name="bgpw" id="bg2"><label for="bg2"><span class="step-n">2</span>Connect</label>
  <input type="radio" name="bgpw" id="bg3"><label for="bg3"><span class="step-n">3</span>Active</label>
  <input type="radio" name="bgpw" id="bg4"><label for="bg4"><span class="step-n">4</span>OpenSent</label>
  <input type="radio" name="bgpw" id="bg5"><label for="bg5"><span class="step-n">5</span>OpenConfirm</label>
  <input type="radio" name="bgpw" id="bg6"><label for="bg6"><span class="step-n">6</span>Established</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv1" viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In the idle state the router has a neighbour statement but is doing nothing">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}.sv1 .dim{opacity:.35}</style>
  <rect class="n" x="60" y="66" width="140" height="36" rx="3"/><text class="nt" x="130" y="89" text-anchor="middle">R1 · AS 65001</text>
  <rect class="n dim" x="440" y="66" width="140" height="36" rx="3"/><text class="nt dim" x="510" y="89" text-anchor="middle">R2 · AS 64500</text>
  <line x1="200" y1="84" x2="440" y2="84" stroke="#D9D9DE" stroke-width="2" stroke-dasharray="5 5"/>
  <text class="k" x="320" y="42" text-anchor="middle">IDLE — nothing is happening yet</text>
  <text class="s" x="320" y="122" text-anchor="middle">A neighbour is configured. No TCP, no packets, no attempt in progress.</text>
  <text class="s" x="320" y="146" text-anchor="middle" fill="#D3002D">Stuck here means the router will not even try: no route to the peer, the neighbour is shut, or a previous failure backed it off.</text>
</svg>
<p class="walk-say"><span class="walk-title">Idle — refusing to start</span>
A session in Idle is not trying. Either there is <b>no route to the peer address</b> in the routing table, the neighbour is administratively <code>shutdown</code>, or BGP has backed off after a failure and is waiting out its timer — and that timer <b>doubles</b> each time, so a session that keeps failing tries progressively less often.
<br><br>The first check is always the boring one: can you ping the peer address <b>from the source address BGP will use?</b> Not from the router generally — from that specific source.</p>
</div>
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In the connect state the router is waiting for its outbound TCP handshake to complete">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B26014}.sv2 .b{stroke:#F2994A;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="60" y="66" width="140" height="36" rx="3"/><text class="nt" x="130" y="89" text-anchor="middle">R1 · AS 65001</text>
  <rect class="n" x="440" y="66" width="140" height="36" rx="3"/><text class="nt" x="510" y="89" text-anchor="middle">R2 · AS 64500</text>
  <path class="b" d="M 200 78 L 440 78"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 200 78 L 440 78"/></circle>
  <text class="k" x="320" y="42" text-anchor="middle">CONNECT — TCP SYN to port 179, waiting</text>
  <text class="s" x="320" y="122" text-anchor="middle">The three-way handshake is in progress. This state is normally over in milliseconds.</text>
  <text class="s" x="320" y="146" text-anchor="middle">You will rarely catch it. If you do, the peer is slow to answer or something in the path is delaying the SYN.</text>
</svg>
<p class="walk-say"><span class="walk-title">Connect — a TCP handshake, nothing more</span>
BGP runs over <b>TCP port 179</b>, and this state is simply "I have sent a SYN and I am waiting". It is so brief you will almost never see it in a show command.
<br><br>If the handshake succeeds, BGP moves straight on and sends its OPEN. If the connect timer expires first, it drops to <b>Active</b> — which, despite the name, is the worse of the two.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In the active state the TCP connection failed and the router is retrying">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B80027}.sv3 .b{stroke:#D3002D;stroke-width:2.5;fill:none;stroke-dasharray:6 4}</style>
  <rect class="n" x="60" y="70" width="140" height="36" rx="3"/><text class="nt" x="130" y="93" text-anchor="middle">R1 · AS 65001</text>
  <rect class="n" x="440" y="70" width="140" height="36" rx="3"/><text class="nt" x="510" y="93" text-anchor="middle">R2 · AS 64500</text>
  <path class="b" d="M 200 82 L 440 82"/>
  <circle r="5" fill="#D3002D"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 200 82 L 380 82"/></circle>
  <line x1="374" y1="74" x2="392" y2="90" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="392" y1="74" x2="374" y2="90" stroke="#D3002D" stroke-width="2.5"/>
  <text class="k" x="320" y="44" text-anchor="middle">ACTIVE — the TCP connection did not complete</text>
  <text class="s" x="320" y="130" text-anchor="middle">The single most misleading word in BGP. &#8220;Active&#8221; does not mean working —</text>
  <text class="s" x="320" y="148" text-anchor="middle" fill="#D3002D">it means actively retrying, and failing.</text>
  <text class="s" x="320" y="170" text-anchor="middle">Causes, in order: no route to the peer, an ACL blocking TCP 179, wrong update-source, wrong peer address.</text>
</svg>
<p class="walk-say"><span class="walk-title">Active — the word that fools everyone</span>
A session oscillating between <b>Active</b> and <b>Connect</b> is a session that cannot establish TCP. It is not a BGP problem at all yet — BGP has not exchanged a single byte of its own.
<br><br>Work down the list in this order: is there a route to the peer address; does an ACL permit TCP 179 <b>in both directions</b>; is <code>update-source</code> set to the interface the far end expects; and does the far end have a <code>neighbor</code> statement for the address your packets will actually arrive from. That last one catches loopback peering constantly.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In OpenSent the router has sent its open message and is checking the one it receives">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}.sv4 .b{stroke:#4b7bec;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="60" y="70" width="140" height="36" rx="3"/><text class="nt" x="130" y="93" text-anchor="middle">R1 · AS 65001</text>
  <rect class="n" x="440" y="70" width="140" height="36" rx="3"/><text class="nt" x="510" y="93" text-anchor="middle">R2 · AS 64500</text>
  <path class="b" d="M 200 78 L 440 78"/>
  <path class="b" d="M 440 98 L 200 98"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 200 78 L 440 78"/></circle>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite" path="M 440 98 L 200 98"/></circle>
  <text class="k" x="320" y="44" text-anchor="middle">OPENSENT — OPEN exchanged, now being checked</text>
  <text class="s" x="320" y="132" text-anchor="middle">Each side verifies: version 4, the AS number matches my <tspan font-weight="700">remote-as</tspan>, the BGP identifier is</text>
  <text class="s" x="320" y="150" text-anchor="middle">valid and not my own, and the hold time is acceptable.</text>
  <text class="s" x="320" y="172" text-anchor="middle" fill="#D3002D">Stuck here or flapping = the OPEN is being rejected. Check the AS numbers on both sides first.</text>
</svg>
<p class="walk-say"><span class="walk-title">OpenSent — TCP worked, BGP is arguing</span>
Reaching this state proves the network path is fine, which is genuinely useful: you can stop looking at routing and ACLs entirely. The dispute is now about the <b>contents</b> of the OPEN.
<br><br>By far the commonest cause is an AS-number mismatch — your <code>remote-as</code> does not match what the peer says it is. The router will send a <b>NOTIFICATION with code 2, subcode 2</b>, which reads "OPEN Message Error / Bad Peer AS", and you can see it in the capture below. Two identical BGP identifiers produce the same symptom with subcode 3.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In OpenConfirm the router is waiting for the keepalive that confirms the open was accepted">
  <style>.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B26014}.sv5 .b{stroke:#F2994A;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="60" y="66" width="140" height="36" rx="3"/><text class="nt" x="130" y="89" text-anchor="middle">R1 · AS 65001</text>
  <rect class="n" x="440" y="66" width="140" height="36" rx="3"/><text class="nt" x="510" y="89" text-anchor="middle">R2 · AS 64500</text>
  <path class="b" d="M 440 84 L 200 84"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 440 84 L 200 84"/></circle>
  <text class="k" x="320" y="42" text-anchor="middle">OPENCONFIRM — waiting for a 19-byte KEEPALIVE</text>
  <text class="s" x="320" y="122" text-anchor="middle">The OPEN was accepted. The only thing left is the KEEPALIVE that says so.</text>
  <text class="s" x="320" y="146" text-anchor="middle">Like Connect, this state is over almost instantly. Sitting in it points at an MD5 password mismatch.</text>
</svg>
<p class="walk-say"><span class="walk-title">OpenConfirm — one message from done</span>
Brief, and rarely seen. If a session lingers here or cycles through it repeatedly, suspect the <b>MD5 password</b>: a mismatch breaks the TCP session underneath rather than producing a clean BGP error, so the symptom is odd and intermittent rather than a clear rejection. The log line to look for is <code>%TCP-6-BADAUTH</code>.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In established the session is up and update messages carry prefixes">
  <style>.sv6 .n{fill:#17171A}.sv6 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}.sv6 .g{stroke:#1f9d6b;stroke-width:3;fill:none}</style>
  <rect class="n" x="60" y="70" width="140" height="36" rx="3" fill="#1f9d6b"/><text class="nt" x="130" y="93" text-anchor="middle">R1 · AS 65001</text>
  <rect class="n" x="440" y="70" width="140" height="36" rx="3" fill="#1f9d6b"/><text class="nt" x="510" y="93" text-anchor="middle">R2 · AS 64500</text>
  <path class="g" d="M 200 78 L 440 78"/>
  <path class="g" d="M 440 98 L 200 98"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 200 78 L 440 78"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.6s" begin="0.5s" repeatCount="indefinite" path="M 440 98 L 200 98"/></circle>
  <text class="k" x="320" y="44" text-anchor="middle">ESTABLISHED — UPDATEs flow, KEEPALIVEs every 60 s</text>
  <text class="s" x="320" y="134" text-anchor="middle">In <tspan font-family="ui-monospace,Menlo,monospace">show ip bgp summary</tspan> this state is shown as <tspan font-weight="700">a number</tspan> — the prefix count —</text>
  <text class="s" x="320" y="152" text-anchor="middle">not as the word &#8220;Established&#8221;. A word in that column always means something is wrong.</text>
  <text class="s" x="320" y="176" text-anchor="middle">Hold time 180 s by default: miss three keepalives and the session is torn down.</text>
</svg>
<p class="walk-say"><span class="walk-title">Established — and the column that hides it</span>
The one detail worth burning in: in <code>show ip bgp summary</code> the State/PfxRcd column shows <b>a number when the session is up</b> and a state name when it is not. So scanning that column for the word "Established" finds nothing, and any word you <em>do</em> see is a fault.
<br><br>An Established session that keeps resetting is usually the hold timer: 180 seconds by default, tripped by three missed keepalives. Lower the timers only after you understand why they were missed — tuning them harder is a common way to make a flap worse.</p>
</div>
</div>
</div>

<figure class="fig">
<svg class="sv7" viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BGP finite state machine from Idle through to Established">
  <style>.sv7 .b{ fill:#fff; stroke:#232327; stroke-width:1.5 }.sv7 .bad{ fill:#D3002D; stroke:#D3002D }.sv7 .ok{ fill:#1f9d6b; stroke:#1f9d6b }.sv7 .t{ font-family:ui-sans-serif,system-ui; font-size:11.5px; font-weight:700; fill:#17171A }.sv7 .tw{ font-family:ui-sans-serif,system-ui; font-size:11.5px; font-weight:700; fill:#fff }.sv7 .s{ font-family:ui-sans-serif,system-ui; font-size:9.5px; fill:#5C5C64 }.sv7 .ar{ stroke:#8A8A93; stroke-width:1.5; fill:none; marker-end:url(#h) }.sv7 .arb{ stroke:#D3002D; stroke-width:1.5; fill:none; marker-end:url(#hr); stroke-dasharray:5 4 }
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

### All three messages, in full

BGP messages are small and regular: a fixed 19-byte header — sixteen bytes of all-ones, a length and a type — and then the body. These are real bytes.

<div class="cap">
<div class="cap-head">Capture · session coming up, then failing <span class="cap-filter">bgp</span></div>
<table class="cap-list">
<thead><tr><th>No.</th><th>Time</th><th>Source</th><th>Destination</th><th>Proto</th><th>Len</th><th>Info</th></tr></thead>
<tbody>
<tr class="is-sel"><td class="no">4</td><td>0.041</td><td>10.0.0.1</td><td>10.0.0.2</td><td>BGP</td><td>99</td><td><b>OPEN Message</b></td></tr>
<tr><td class="no">6</td><td>0.088</td><td>10.0.0.2</td><td>10.0.0.1</td><td>BGP</td><td>99</td><td>OPEN Message</td></tr>
<tr class="ctrl"><td class="no">7</td><td>0.089</td><td>10.0.0.1</td><td>10.0.0.2</td><td>BGP</td><td>73</td><td>KEEPALIVE Message</td></tr>
<tr class="err"><td class="no">19</td><td>4.220</td><td>10.0.0.3</td><td>10.0.0.1</td><td>BGP</td><td>75</td><td>NOTIFICATION — Bad Peer AS</td></tr>
</tbody>
</table>
<div class="cap-hex"><pre>OPEN — AS 65001, hold 180, router-id 10.255.255.1
0000  <mark>ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff</mark>   ................
0010  <mark>00 2d</mark> <mark>01</mark> <mark>04</mark> <mark>fd e9</mark> <mark>00 b4</mark>  <mark>0a ff ff 01</mark> 10 02 0e 01   .-..............
0020  04 00 01 00 01 02 00 <mark>41</mark>  04 00 00 fd e9                .......A.....

KEEPALIVE — the entire message
0000  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff   ................
0010  <mark>00 13</mark> <mark>04</mark>                                            ...

NOTIFICATION — why the other session died
0000  ff ff ff ff ff ff ff ff  ff ff ff ff ff ff ff ff   ................
0010  00 15 <mark>03</mark> <mark>02 02</mark>                                      .....</pre></div>
<div class="cap-note"><b>Read the OPEN left to right and every troubleshooting question is answered.</b> <code>00 2d</code> — 45 bytes. <code>01</code> — type 1, OPEN. <code>04</code> — BGP version 4. <code>fd e9</code> — <b>65001, the sender's AS number</b>, and the one thing your <code>remote-as</code> must match. <code>00 b4</code> — hold time 180. <code>0a ff ff 01</code> — the BGP identifier, 10.255.255.1. Then the capabilities, of which <code>41</code> is code 65: <b>four-octet AS support</b>, which is why a 32-bit AS number can appear in a protocol whose AS field is only 16 bits wide.
<br><br><b>The KEEPALIVE is 19 bytes and 16 of them are 0xFF.</b> There is no payload at all — the header <em>is</em> the message. One of these every 60 seconds is all that holds a session up.
<br><br><b>And the NOTIFICATION is the one that tells you why it broke.</b> <code>03</code> is type 3; <code>02 02</code> is code 2 subcode 2, which reads <b>"OPEN Message Error / Bad Peer AS"</b>. That is the exact failure the state walk described at OpenSent, in two bytes. Subcode <code>03</code> would be a bad BGP identifier, <code>06</code> an unacceptable hold time, and code <code>04</code> on its own means the hold timer expired — a session that was up and stopped hearing keepalives.</div>
</div>

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

<div class="cmd">
<div class="cmd-line">router bgp 65001
 <span class="t">bgp router-id</span> <span class="opt">10.0.0.1</span>
 <span class="t">neighbor</span> <span class="opt">10.0.0.2</span> <span class="t">remote-as</span> <span class="opt">65001</span>
 <span class="t">neighbor</span> <span class="opt">10.0.0.2</span> <span class="t">update-source Loopback0</span>
 <span class="t">neighbor</span> <span class="opt">203.0.113.9</span> <span class="t">password</span> <span class="opt">&lt;shared-secret&gt;</span>
 address-family ipv4 unicast
  <span class="t">neighbor</span> <span class="opt">10.0.0.2</span> <span class="t">next-hop-self</span>
  <span class="t">network</span> <span class="opt">198.51.100.0</span> <span class="t">mask</span> <span class="opt">255.255.255.0</span>
  <span class="t">neighbor</span> <span class="opt">203.0.113.9</span> <span class="t">soft-reconfiguration inbound</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>bgp router-id</dt><dd><b>Pin it.</b> Left alone, BGP picks the highest loopback address — so the ID changes if that interface disappears, and <b>changing the router ID resets every session</b>. It is also the final tie-breaker in best-path selection, which means an unpinned ID makes path selection unpredictable in a way nobody will think to check.</dd></div>
<div><dt>remote-as</dt><dd>Same AS as yours = <b>iBGP</b>. Different = <b>eBGP</b>. That one number changes the TTL used, whether the next hop is rewritten, and whether routes learned here are passed to other iBGP peers. A typo produces a NOTIFICATION code 2 subcode 2 and a session stuck in OpenSent.</dd></div>
<div class="is-key"><dt>update-source<br>Loopback0</dt><dd>The source address of BGP's own packets must be the address the far end has a <code>neighbor</code> statement for. Peer to a loopback and you <b>must</b> source from that loopback — otherwise your packets arrive from an interface address the peer has never heard of and are silently ignored. <b>Configure it on both ends</b>; one side alone is the classic loopback-peering failure, and it presents as a session stuck in Active.</dd></div>
<div><dt>password</dt><dd>MD5 on the TCP session. A mismatch does not produce a clean BGP error — it breaks TCP underneath, so the symptom is an odd flap rather than a rejection. The log line is <code>%TCP-6-BADAUTH</code>, and it is the thing to grep for when a session dies in OpenConfirm.</dd></div>
<div class="is-key"><dt>next-hop-self</dt><dd>iBGP does <b>not</b> change the next hop, so a route learned from an external peer is passed to your internal peers still pointing at the <em>external</em> router's address — which your internal routers usually have no route to. The route arrives, is marked inaccessible, and is never used. This one line on every iBGP neighbour prevents it.</dd></div>
<div class="is-key"><dt>network ... mask ...</dt><dd>In BGP this does <b>not</b> mean "run BGP on this interface" the way it does in OSPF. It means <em>advertise this prefix, if an exactly matching route already exists in my routing table</em>. <b>The mask must match exactly</b> — a <code>/24</code> in the table is not advertised by a <code>network</code> statement for a <code>/23</code>. Most "my prefix is not being advertised" tickets are this.</dd></div>
<div><dt>soft-reconfiguration<br>inbound</dt><dd>Stores the neighbour's unmodified updates so inbound policy can be changed and re-applied without tearing the session down. It costs memory. The modern alternative is <b>route refresh</b>, negotiated automatically and needing no configuration — check for it with <code>show ip bgp neighbors | include Route refresh</code> before enabling soft-reconfiguration on a full table.</dd></div>
</dl>
</div>

### Reading the summary

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — four neighbours, three different faults</div>
<pre><span class="p">R1#</span> <span class="c">show ip bgp summary</span>
BGP router identifier 10.0.0.1, local AS number 65001
BGP table version is 42, 12 network entries using 2976 bytes of memory

Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  <span class="y">State/PfxRcd</span>
10.0.0.2        4 65001    1893    1901       42    0    0 1d04h    <span class="g">       8</span>
10.0.0.3        4 65001       0       0        1    0    0 never    <span class="r">Active</span>
203.0.113.9     4 64500   14022   13998       42    0    0 02:14:19 <span class="g">       4</span>
203.0.113.13    4 64501      12      14        1    0    0 00:00:31 <span class="r">OpenSent</span>

<span class="o">! The last column is the whole command. A NUMBER means Established.</span>
<span class="o">! A WORD means it is not, and the word tells you how far it got.</span>
<span class="o">!</span>
<span class="o">! 10.0.0.2      8 prefixes, up over a day. Healthy.</span>
<span class="o">! 10.0.0.3      Active, never up, ZERO messages either way -> TCP never formed.</span>
<span class="o">!               Routing, ACL, or the far end has no neighbor statement for us.</span>
<span class="o">! 203.0.113.9   Up 2h14m. Fine — but if that keeps resetting to minutes, it is flapping.</span>
<span class="o">! 203.0.113.13  OpenSent, and 12 messages received -> TCP is FINE, BGP is arguing.</span>
<span class="o">!               Check remote-as on both sides before anything else.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The message counters tell you which half of the problem you have.</b> Zero received means nothing is arriving and the fault is below BGP — routing, firewall, source address. A non-zero count with a state name means the packets are getting through and BGP is rejecting what is in them, which is a completely different investigation and a much shorter one.</p>

Four neighbours, three distinct stories:

- **10.0.0.2** — a number in the last column, so Established, receiving 8 prefixes. Up over a day. Healthy.
- **10.0.0.3** — `Active`, `never` came up, zero messages either way. TCP is not completing. Check routing to 10.0.0.3 and whether the far end has a matching `neighbor` statement.
- **203.0.113.9** — up 2 hours 14 minutes, 4 prefixes. Fine, but note the uptime: if that keeps resetting to minutes, the session is flapping.
- **203.0.113.13** — `OpenSent`, messages sent but the session is not forming. Their Open is missing or rejected. **Check the AS number on both sides first** — a wrong `remote-as` produces exactly this.

---

<div class="real">
<b>In the real world</b>
When a session will not come up, the fastest question is not a BGP question. It is: <b>can I open a TCP connection to port 179 from the exact address BGP will use?</b> On the router, <code>telnet 10.0.0.2 179 /source-interface Loopback0</code> answers it in one line — a connection that opens and immediately closes means the peer is listening and the path is clear, so the fault is in the OPEN and you can stop looking at firewalls. A connection that hangs or refuses means you have a network problem and nothing in BGP will fix it. That single test splits the fault space in half before you have read any BGP output at all.
</div>

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

<div class="lab">
<div class="lab-head">Lab — walk a session through all six states, then break it six ways</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Bring up one eBGP and one iBGP session and watch each state transition happen rather than reading about it; capture the OPEN and find the AS number, hold time and router ID in the hex yourself; then produce every common failure deliberately — Idle, Active, OpenSent, a password mismatch, a missing <code>next-hop-self</code> and a <code>network</code> statement with the wrong mask — so that each one maps to a symptom you have seen with your own eyes.</div>

**Topology.** R1 (AS 65001) and R2 (AS 65001) peered iBGP loopback to loopback, with OSPF between them carrying the loopbacks. R3 (AS 64500) connected to R1 over a directly-attached link for eBGP. A prefix 198.51.100.0/24 on a loopback of R1.

<p class="lab-step"><span class="n">1</span>Watch the states go past</p>

```cisco
R1# debug ip bgp
R1# terminal monitor
```

Then configure the eBGP neighbour and watch the log.

<div class="lab-watch"><b>Things to notice</b>
You will see the transitions named explicitly — Idle to Connect to OpenSent to OpenConfirm to Established — and the whole sequence takes well under a second on a healthy link. <b>Connect and OpenConfirm will flash past</b>; that is exactly why finding a session sitting in either one is diagnostic. Save this log. It is the reference you will compare every broken session against.</div>

<p class="lab-step"><span class="n">2</span>Capture the OPEN and read it by hand</p>

Capture on the link and filter `bgp`. Open the OPEN message.

<div class="lab-watch"><b>Things to notice</b>
Find, in the hex: the sixteen <code>ff</code> bytes, the length, the type byte <code>01</code>, version <code>04</code>, and then <b>the AS number</b>. Convert it from hex yourself and confirm it matches what the peer is configured with. Then find the hold time and confirm the two ends negotiated <b>the lower of the two values</b> — set one end to <code>timers 10 30</code> and re-capture to watch the negotiated value change.
<br><br>Also find capability <code>41</code> (65) and note the AS number appears <em>again</em> inside it, in 32 bits. That is how 4-byte AS numbers travel through a 2-byte field.</div>

<p class="lab-step"><span class="n">3</span>Produce Idle, and then Active</p>

1. `neighbor 203.0.113.9 shutdown` → **Idle**.
2. Remove the shutdown, then remove the route to the peer (or shut the interface toward it) → **Idle** again, for a different reason.
3. Restore routing, but apply an ACL on the peer denying TCP 179 → **Active**.

<div class="lab-watch"><b>Things to notice</b>
Compare the message counters in <code>show ip bgp summary</code> for each. All three show zero received — which is the signature of a fault <b>below</b> BGP. Then note the retry behaviour: leave the ACL in place and watch the interval between attempts <b>double</b> each time. A session that has been failing for an hour is barely trying any more, which is why a fixed problem sometimes seems to take minutes to recover.</div>

<p class="lab-step"><span class="n">4</span>Produce OpenSent, and read the NOTIFICATION</p>

Set the wrong `remote-as` on R1 for the R3 session — say 64501 instead of 64500 — with the capture still running.

<div class="lab-watch"><b>Things to notice</b>
The session reaches OpenSent and stops, and the counters now show messages <b>received</b> — proof that TCP is healthy and the argument is about content. In the capture, find the NOTIFICATION and read the two bytes after the type: <code>02 02</code>, "OPEN Message Error / Bad Peer AS".
<br><br>Now repeat with both routers configured with <b>the same <code>bgp router-id</code></b>. Same symptom, different subcode — <code>02 03</code>, bad BGP identifier. Two faults that look identical in <code>show ip bgp summary</code> and are told apart instantly by one byte on the wire.</div>

<p class="lab-step"><span class="n">5</span>Break the loopback peering the usual way</p>

Remove `update-source Loopback0` from R1 only, leaving R2's neighbour statement pointing at R1's loopback.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The session stays up</b> — you removed it from the wrong end, or R2 has a neighbour statement for the physical address too. Check with <code>show ip bgp neighbors | include Local host</code>, which prints the address actually in use.</li>
<li><b>It fails instantly rather than after the hold time</b> — normal if TCP resets. The slower failure appears when packets are simply ignored.</li>
<li><b>You cannot tell which end is wrong</b> — that is the lesson. Use <code>telnet &lt;peer&gt; 179 /source-interface Loopback0</code> from each side; the side that cannot connect is the side whose source address the peer does not recognise.</li>
</ul></div>

<p class="lab-step"><span class="n">6</span>The two faults where the session is perfectly healthy</p>

Both of these leave BGP Established and still deliver nothing.

1. **Missing `next-hop-self`.** Remove it from R1's iBGP neighbour. On R2, `show ip bgp` — the eBGP-learned routes are there, marked with `(inaccessible)` or simply never selected, because their next hop is R3's address and R2 has no route to it.
2. **Wrong mask on `network`.** Change R1's statement to `network 198.51.100.0 mask 255.255.254.0`. The prefix silently stops being advertised.

<div class="lab-watch"><b>Things to notice</b>
Neither of these shows up anywhere in <code>show ip bgp summary</code>. The session is up, the prefix counts look plausible, and the routes do not work. <b>This is the category of BGP fault that takes longest to find</b>, because every instinct says to check the session — and the session is fine.
<br><br>The command that finds the first is <code>show ip bgp</code> on the receiving router, looking at the next-hop column. The command that finds the second is <code>show ip route 198.51.100.0</code> on the advertising router, checking that an exactly matching route exists.</div>

<p class="lab-step"><span class="n">7</span>Kill a healthy session with silence</p>

With the eBGP session Established, apply an ACL that permits the TCP session but drops nothing else, then block BGP's keepalives by filtering established traffic in one direction only.

<div class="lab-watch"><b>Things to notice</b>
The session stays up for <b>the full hold time</b> — 180 seconds by default — and then drops with a NOTIFICATION of <b>code 4, Hold Timer Expired</b>. Nothing before that moment indicates any problem at all. Now set <code>timers 10 30</code> on both ends and repeat: the failure is detected in 30 seconds instead of three minutes.
<br><br>That comparison is the argument for tuning BGP timers, and also the warning: aggressive timers on a congested or high-latency link will tear down sessions that were merely slow.</div>

<div class="lab-earned"><b>What you earned</b>
You can look at one column of <code>show ip bgp summary</code> and know whether your problem is below BGP or inside it — zero messages received means routing or firewall, a state name with messages received means the OPEN is being rejected. You have read an AS number and a hold time out of a hex dump, so a capture is now a tool rather than a wall of bytes. You know that <code>Active</code> means failing, that the retry timer doubles, and that two completely different faults are distinguished by one byte in a NOTIFICATION. And you have met the two faults that leave the session perfectly healthy and the traffic broken, which is the pair that costs everybody else an afternoon.</div>

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
