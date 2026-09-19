---
title: "Spanning Tree From Scratch: Why It Exists, How the Root Is Elected, and What RSTP Changed"
excerpt: "A redundant Layer 2 network melts itself in under a second without STP. Here is the loop that causes it, the three elections that stop it, the BPDU that carries the votes, and the guards that keep a good design from being ruined by one cable."
date: "2026-09-20"
tags: ["Spanning Tree", "STP", "RSTP", "MST", "Layer 2", "Switching", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 2.5 *Interpret basic operations of Rapid PVST+ Spanning Tree Protocol*. ENCOR 350-401 — 3.1.c *Configure and verify common Spanning Tree Protocols (RSTP, MST) and Spanning Tree enhancements such as root guard and BPDU guard*.

## Cheat sheet

| | |
|---|---|
| **The problem** | Ethernet frames have no TTL. A loop at Layer 2 never stops. |
| **The fix** | Block enough ports to leave exactly one active path between any two switches. |
| **Root bridge** | The switch everyone measures distance from. Lowest Bridge ID wins. |
| **Bridge ID** | 4-bit priority + 12-bit extended system ID (the VLAN) + 6-byte MAC. 8 bytes total. |
| **Default priority** | 32768. With VLAN 10, the BID priority field reads 32778. |
| **Root port** | On every non-root switch: the one port with the lowest cost back to the root. Exactly one. |
| **Designated port** | On every segment: the one port permitted to forward onto it. Exactly one. |
| **Blocking port** | Everything left over. Receives BPDUs, forwards nothing. |
| **Cost (long mode)** | 10 Gb = 2000, 1 Gb = 20000, 100 Mb = 200000. Short mode: 2, 4, 19. |
| **STP timers** | Hello 2s, Forward Delay 15s, Max Age 20s. 30–50 seconds to converge. |
| **RSTP** | 802.1w. Sub-second on point-to-point links. Proposal/agreement instead of timers. |
| **PortFast** | Skip listening and learning on an access port. Never on a switch link. |
| **BPDU Guard** | Receive a BPDU on a PortFast port → err-disable it. |
| **Root Guard** | Receive a *superior* BPDU on this port → root-inconsistent, stop forwarding. |
| **Loop Guard** | Stop receiving BPDUs on a non-designated port → loop-inconsistent, do not unblock. |

---

## Start with the thing that goes wrong

Every explanation of spanning tree should begin with the accident, because the protocol only makes sense once you have watched a network destroy itself.

Three switches, cabled in a triangle for redundancy. That is good design — any one cable can fail and everything still reaches everything. Now a PC sends a single broadcast frame. An ARP request, say. One frame.

A switch floods a broadcast out of every port except the one it arrived on. So SW1 floods to SW2 and SW3. SW2 floods what it received to SW3. SW3 floods what it received to SW2. Those copies arrive and get flooded again.

<figure class="fig">
<svg viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three switches in a triangle with a broadcast frame multiplying around the loop">
  <style>
    .sw { fill:#17171A }
    .swt { fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:13px; font-weight:700 }
    .lk { stroke:#8A8A93; stroke-width:2 }
    .fr { fill:#D3002D }
    .lbl { fill:#5C5C64; font-family:ui-sans-serif,system-ui; font-size:11px }
    .big { fill:#D3002D; font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700 }
  </style>
  <line class="lk" x1="320" y1="62" x2="150" y2="190"/>
  <line class="lk" x1="320" y1="62" x2="490" y2="190"/>
  <line class="lk" x1="150" y1="190" x2="490" y2="190"/>
  <rect class="sw" x="270" y="38" width="100" height="34" rx="3"/>
  <text class="swt" x="320" y="60" text-anchor="middle">SW1</text>
  <rect class="sw" x="100" y="176" width="100" height="34" rx="3"/>
  <text class="swt" x="150" y="198" text-anchor="middle">SW2</text>
  <rect class="sw" x="440" y="176" width="100" height="34" rx="3"/>
  <text class="swt" x="490" y="198" text-anchor="middle">SW3</text>
  <circle class="fr" cx="240" cy="118" r="5"/><circle class="fr" cx="205" cy="145" r="5"/>
  <circle class="fr" cx="400" cy="118" r="5"/><circle class="fr" cx="435" cy="145" r="5"/>
  <circle class="fr" cx="270" cy="190" r="5"/><circle class="fr" cx="320" cy="190" r="5"/><circle class="fr" cx="370" cy="190" r="5"/>
  <text class="lbl" x="320" y="232" text-anchor="middle">one broadcast in · copies multiply on every hop · nothing removes them</text>
  <text class="big" x="320" y="24" text-anchor="middle">BROADCAST STORM</text>
</svg>
<figcaption><b>Figure 1.</b> The frame has no hop count. Each lap around the triangle doubles the number of copies, and each copy is flooded again.</figcaption>
</figure>

Three things now happen, fast.

**The broadcast storm.** Copies double on every lap. Within a second the links are saturated. CPU on every switch goes to 100% because broadcasts are punted to the control plane.

**MAC table instability.** The PC's MAC arrives on port Gi0/1, then on Gi0/2, then Gi0/1 again, thousands of times a second. The MAC address table is rewritten constantly. Unicast forwarding stops working because the switch no longer knows where anything is.

**Duplicate frames.** Anything that does get delivered arrives many times. Applications see corrupted streams.

<div class="why">
<b>Why Ethernet cannot fix this itself</b>
An IPv4 header has a TTL field: every router decrements it and a packet that loops is eventually dropped at zero. The Ethernet header has no equivalent. There is no hop count, no age, nothing that lets a switch recognise a frame it has already seen. That single omission is the entire reason spanning tree exists. It is not a performance feature. It is a safety interlock.
</div>

---

## The idea in one sentence

> Build a physical topology with as many redundant links as you like, then have the switches agree on which ports to switch off so that exactly one active path remains between any two points.

The switched network is a graph. Spanning tree reduces that graph to a **tree** — a shape with no cycles by definition — while keeping every switch connected. The blocked links are not wasted: they are standing by, and when an active link fails, spanning tree recalculates and brings one of them up.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same triangle with one port blocked, leaving a loop-free tree">
  <style>
    .sw { fill:#17171A } .rootsw { fill:#D3002D }
    .swt { fill:#FAF8F5; font-family:ui-sans-serif,system-ui; font-size:13px; font-weight:700 }
    .lk { stroke:#1f9d6b; stroke-width:3 }
    .blk { stroke:#B5B5BC; stroke-width:2; stroke-dasharray:6 5 }
    .pt { fill:#232327; font-family:ui-sans-serif,system-ui; font-size:10px; font-weight:700 }
    .lbl { fill:#5C5C64; font-family:ui-sans-serif,system-ui; font-size:11px }
    .x { fill:#D3002D; font-family:ui-sans-serif,system-ui; font-size:15px; font-weight:800 }
  </style>
  <line class="lk" x1="320" y1="62" x2="150" y2="180"/>
  <line class="lk" x1="320" y1="62" x2="490" y2="180"/>
  <line class="blk" x1="200" y1="190" x2="440" y2="190"/>
  <rect class="rootsw" x="262" y="38" width="116" height="34" rx="3"/>
  <text class="swt" x="320" y="60" text-anchor="middle">SW1 · ROOT</text>
  <rect class="sw" x="100" y="173" width="100" height="34" rx="3"/>
  <text class="swt" x="150" y="195" text-anchor="middle">SW2</text>
  <rect class="sw" x="440" y="173" width="100" height="34" rx="3"/>
  <text class="swt" x="490" y="195" text-anchor="middle">SW3</text>
  <text class="pt" x="248" y="100">DP</text><text class="pt" x="378" y="100">DP</text>
  <text class="pt" x="196" y="152">RP</text><text class="pt" x="424" y="152">RP</text>
  <text class="pt" x="212" y="182">DP</text><text class="pt" x="414" y="182">BLK</text>
  <text class="x" x="320" y="196" text-anchor="middle">✕</text>
  <text class="lbl" x="320" y="232" text-anchor="middle">every switch reaches the root · no cycle · the dashed link waits in reserve</text>
</svg>
<figcaption><b>Figure 2.</b> SW3&rsquo;s port toward SW2 is blocked. Physically still a triangle; logically a tree. Break either green link and the blocked port comes up.</figcaption>
</figure>

---

## How the switches agree: the BPDU

Switches vote using **Bridge Protocol Data Units**, sent every 2 seconds to the multicast MAC `01:80:C2:00:00:00`. A BPDU is not user traffic and is never forwarded — each switch consumes it, thinks, and originates its own.

The fields that decide everything:

```text
 Protocol ID   (2 bytes)  always 0x0000
 Version       (1 byte)   0x00 = STP, 0x02 = RSTP, 0x03 = MST
 BPDU Type     (1 byte)   0x00 = Configuration, 0x80 = TCN
 Flags         (1 byte)   TC, Proposal, Port Role, Learning, Forwarding, Agreement, TCA
 Root ID       (8 bytes)  ← who I think the root is      [priority + ext sys ID + MAC]
 Root Path Cost(4 bytes)  ← what it costs ME to reach it
 Bridge ID     (8 bytes)  ← who I am                     [priority + ext sys ID + MAC]
 Port ID       (2 bytes)  ← which of my ports this left  [priority + port number]
 Message Age   (2 bytes)
 Max Age       (2 bytes)  20s
 Hello Time    (2 bytes)  2s
 Forward Delay (2 bytes)  15s
```

Four of those fields — **Root ID, Root Path Cost, Bridge ID, Port ID** — are the entire decision procedure. A switch compares an incoming BPDU against its own, in that order, and the first difference settles it. Cisco documentation calls a BPDU that wins this comparison **superior**.

### The Bridge ID, and why yours says 32778

The 8-byte Bridge ID used to be a 2-byte priority plus a 6-byte MAC. Per-VLAN spanning tree needed a separate root per VLAN, so the priority field was split:

```text
┌────────────────┬──────────────────────┬──────────────────────────┐
│  Priority      │  Extended System ID  │  MAC address             │
│  4 bits        │  12 bits             │  48 bits                 │
│  0–61440       │  = the VLAN number   │  the switch's own        │
│  steps of 4096 │                      │                          │
└────────────────┴──────────────────────┴──────────────────────────┘
```

Priority is therefore only settable in multiples of 4096: 0, 4096, 8192 … 61440. The VLAN is added on top. Default 32768 in VLAN 10 displays as **32778**. That is not a typo in your output; it is 32768 + 10.

<div class="note">
<b>Read this off a live switch</b>
<code>show spanning-tree vlan 10</code> prints the local Bridge ID and the root&rsquo;s. If the two are identical, this switch <em>is</em> the root for VLAN 10 — the line <code>This bridge is the root</code> appears above it.
</div>

---

## The three elections

Everything spanning tree does reduces to three decisions, made in this order. Get the order right and the rest follows.

### 1. One root bridge, network-wide

Every switch boots believing it is the root and says so. It listens. The lowest Bridge ID wins — first on priority, and if priority ties, on the lowest MAC address.

<div class="warn">
<b>The default is almost always wrong</b>
Leave every switch at 32768 and the election falls through to MAC address. The lowest MAC belongs to the oldest switch, which is usually the least powerful box in the least appropriate place — often an access switch under somebody&rsquo;s desk. Your entire traffic pattern then bends around it. <b>Always set the root manually.</b>
</div>

### 2. One root port per non-root switch

Each non-root switch picks the single port with the best path back to the root. Tie-breakers, in strict order:

1. **Lowest cumulative root path cost.** Cost is per-link, based on bandwidth, and accumulates as a BPDU travels — each switch adds the cost of the port it *received* on.
2. **Lowest sender Bridge ID.** Two equal-cost paths via different neighbours → prefer the neighbour with the lower BID.
3. **Lowest sender Port ID.** Two links to the *same* neighbour → prefer the one leaving the neighbour's lower port ID (priority, then port number).
4. **Lowest local Port ID.** Practically never reached.

<table>
<thead><tr><th>Link speed</th><th>Cost (short / 16-bit)</th><th>Cost (long / 32-bit)</th></tr></thead>
<tbody>
<tr><td>10 Mb</td><td>100</td><td>2,000,000</td></tr>
<tr><td>100 Mb</td><td>19</td><td>200,000</td></tr>
<tr><td>1 Gb</td><td>4</td><td>20,000</td></tr>
<tr><td>10 Gb</td><td>2</td><td>2,000</td></tr>
<tr><td>100 Gb</td><td>1</td><td>200</td></tr>
</tbody>
</table>

Short mode is the default on most platforms and **cannot tell 10 Gb from 100 Gb apart meaningfully** — 2 versus 1, and everything above 10 Gb clamps toward 1. On a modern network turn on long mode with `spanning-tree pathcost method long`, consistently, everywhere.

### 3. One designated port per segment

Every link segment gets exactly one port allowed to forward onto it — the one on the switch with the lowest cost to the root, tie-broken by BID then Port ID. Every port on the root bridge is designated, always, by definition: its cost to the root is zero.

**Anything that is neither a root port nor a designated port is blocked.** That is the whole algorithm.

<details class="reveal">
<summary>Work one out before you read the answer</summary>

SW1 is root. SW2 and SW3 each have a 1 Gb link to SW1 and a 1 Gb link to each other. Long mode. Which port blocks, and on which switch?

Both SW2 and SW3 reach the root at cost 20000 via their direct link — those become root ports. On the SW2–SW3 segment both have equal cost (20000) to the root, so the tie breaks on **lowest Bridge ID**. If SW2 has the lower MAC, SW2's port is designated and **SW3's port toward SW2 blocks**.

Change one variable — make SW3's direct link 100 Mb — and SW3's cost via SW2 (20000 + 20000 = 40000) beats its direct path (200000). SW3's root port moves to the link facing SW2, and the *direct* link to SW1 blocks instead. Cost beats topology intuition every time.
</details>

---

## Port states, and the 30 seconds everybody complains about

Classic 802.1D moves a port through states on timers:

<figure class="fig">
<svg viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="STP port state progression from blocking to forwarding">
  <style>
    .bx { fill:#fff; stroke:#232327; stroke-width:1.5 }
    .bxf { fill:#1f9d6b; stroke:#1f9d6b }
    .bxb { fill:#D3002D; stroke:#D3002D }
    .t { font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700; fill:#17171A }
    .tw { font-family:ui-sans-serif,system-ui; font-size:12px; font-weight:700; fill:#fff }
    .s { font-family:ui-sans-serif,system-ui; font-size:10px; fill:#5C5C64 }
    .ar { stroke:#8A8A93; stroke-width:1.5; marker-end:url(#a) }
  </style>
  <defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="bx bxb" x="14" y="40" width="108" height="38" rx="3"/>
  <text class="tw" x="68" y="64" text-anchor="middle">Blocking</text>
  <text class="s" x="68" y="96" text-anchor="middle">20s max age</text>
  <text class="s" x="68" y="110" text-anchor="middle">listens only</text>
  <line class="ar" x1="124" y1="59" x2="160" y2="59"/>
  <rect class="bx" x="164" y="40" width="108" height="38" rx="3"/>
  <text class="t" x="218" y="64" text-anchor="middle">Listening</text>
  <text class="s" x="218" y="96" text-anchor="middle">15s fwd delay</text>
  <text class="s" x="218" y="110" text-anchor="middle">elects, no MAC</text>
  <line class="ar" x1="274" y1="59" x2="310" y2="59"/>
  <rect class="bx" x="314" y="40" width="108" height="38" rx="3"/>
  <text class="t" x="368" y="64" text-anchor="middle">Learning</text>
  <text class="s" x="368" y="96" text-anchor="middle">15s fwd delay</text>
  <text class="s" x="368" y="110" text-anchor="middle">builds MAC table</text>
  <line class="ar" x1="424" y1="59" x2="460" y2="59"/>
  <rect class="bx bxf" x="464" y="40" width="120" height="38" rx="3"/>
  <text class="tw" x="524" y="64" text-anchor="middle">Forwarding</text>
  <text class="s" x="524" y="96" text-anchor="middle">passes traffic</text>
  <text class="s" x="524" y="18" text-anchor="middle">30–50 seconds total</text>
</svg>
<figcaption><b>Figure 3.</b> Listening and learning each burn a full forward delay. This is why a PC that boots faster than 30 seconds used to fail DHCP on a freshly-linked port.</figcaption>
</figure>

The delay exists because 802.1D had no way to *ask* a neighbour whether it was safe to forward. It waited long enough for news to propagate and hoped. RSTP fixed exactly that.

---

## What RSTP actually changed

802.1w — Rapid Spanning Tree, and on Cisco gear **Rapid PVST+** — keeps the same three elections and the same BPDU fields. What changed is how quickly a port can be trusted.

**Port states collapse to three.** Discarding, Learning, Forwarding. Blocking and listening were both "not forwarding, not learning", so they merged.

**Roles became explicit and are carried in the BPDU flags.** Root, Designated, and two new backup roles:

- **Alternate port** — an alternative path to the root. Blocked, but ready. If the root port fails it is promoted *immediately*, no timers.
- **Backup port** — a second connection to the same segment, usually via a hub. Rare.

**Proposal and agreement replaces waiting.** On a point-to-point link, a switch wanting to forward sends a BPDU with the Proposal flag. The neighbour blocks all its non-edge designated ports (the "sync"), replies with Agreement, and both sides go forwarding. This is a handshake, not a timer, and it completes in milliseconds.

**Every switch originates BPDUs.** In 802.1D only the root generated them and others relayed. In RSTP each switch sends its own every hello, so losing three in a row (6 seconds) declares the neighbour gone — far faster than a 20-second max age.

<div class="note">
<b>Link type matters more than people realise</b>
The proposal/agreement handshake only runs on <code>point-to-point</code> links, which RSTP infers from <b>full duplex</b>. A link forced to half duplex is treated as <code>shared</code> and falls back to the slow 802.1D timer behaviour. A duplex mismatch therefore causes slow convergence as well as errors — and the two symptoms are easy to blame on each other.
</div>

### The flavours you will meet

| | Instances | Notes |
|---|---|---|
| **PVST+** | One per VLAN | Cisco. Classic timers. Per-VLAN root tuning, heavy CPU at scale. |
| **Rapid PVST+** | One per VLAN | Cisco default on Catalyst. Fast, but 500 VLANs = 500 instances. |
| **MST (802.1s)** | One per *group* of VLANs | Map many VLANs to a handful of instances. ENCOR 3.1.c. Region name, revision and VLAN-to-instance map must match **exactly** on every switch or the region splits. |

---

## Configuration

Set the root deliberately. Never let the election pick for you.

```cisco
! --- Distribution switch A: root for the odd VLANs, backup for the even ---
spanning-tree mode rapid-pvst
spanning-tree pathcost method long
spanning-tree vlan 10,30 root primary
spanning-tree vlan 20,40 root secondary

! --- Distribution switch B: the mirror image ---
spanning-tree mode rapid-pvst
spanning-tree pathcost method long
spanning-tree vlan 20,40 root primary
spanning-tree vlan 10,30 root secondary
```

`root primary` is a macro, not a protocol feature. It reads the current root's priority and sets the local one low enough to win — 24576, or 4096 below the current root if that is already lower. It does **not** keep watching. Bring in a switch with a lower priority later and it takes over. For predictability, set the number yourself:

```cisco
spanning-tree vlan 10,30 priority 24576
spanning-tree vlan 20,40 priority 28672
```

Splitting odd and even VLANs across two distribution switches means both uplinks carry traffic instead of one sitting idle. That is the standard campus pattern, and it is the reason per-VLAN spanning tree exists at all.

### The edge, and the guards

```cisco
! --- Access ports: forward immediately, and never trust a BPDU here ---
interface range GigabitEthernet1/0/1 - 46
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast
 spanning-tree bpduguard enable

! --- Or set the default for every access port on the box ---
spanning-tree portfast default
spanning-tree portfast bpduguard default

! --- Uplinks toward the access layer: refuse to be demoted ---
interface range TenGigabitEthernet1/1/1 - 8
 spanning-tree guard root

! --- Fibre and EtherChannel links where a one-way failure is possible ---
spanning-tree loopguard default
```

### Reading the output

```text
SW2# show spanning-tree vlan 10

VLAN0010
  Spanning tree enabled protocol rstp
  Root ID    Priority    24586
             Address     0062.ec9d.c580
             Cost        20000
             Port        1 (GigabitEthernet1/0/1)
             Hello Time  2 sec  Max Age 20 sec  Forward Delay 15 sec

  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)
             Address     70df.2f3c.1a00

Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- ----------------
Gi1/0/1          Root FWD 20000     128.1    P2p
Gi1/0/2          Altn BLK 20000     128.2    P2p
Gi1/0/10         Desg FWD 20000     128.10   P2p Edge
```

Read it in this order, every time:

1. **`protocol rstp`** — the mode actually running. If this says `ieee` you are on classic PVST+ and convergence will be slow.
2. **Root ID vs Bridge ID** — different numbers, so this is not the root. Root priority 24586 = 24576 + VLAN 10, so somebody set it deliberately. Good.
3. **`Cost 20000`** — one gigabit hop from the root.
4. **Roles** — one `Root`, one `Altn` (the redundant path, correctly blocked), one `Desg Edge` (a PortFast access port). Exactly what a healthy access switch looks like.
5. **`Type P2p`** — full duplex, so rapid convergence is available. `Shr` here would mean half duplex and slow behaviour.

---

## What breaks in real networks

**Somebody plugs a cheap switch into a wall port.** It has a factory MAC lower than anything in your data centre, wins the root election, and the campus reroutes through a desk. BPDU Guard on every access port prevents this absolutely — the port err-disables the instant a BPDU arrives.

**Unidirectional fibre failure.** A fibre pair where one strand breaks: the link stays up, but one side stops receiving BPDUs. A blocked port that stops hearing BPDUs assumes the path is gone and unblocks — creating the loop STP existed to prevent. Loop Guard covers this by putting the port into `loop-inconsistent` instead of forwarding. UDLD attacks the same problem at Layer 1. Run both.

**PortFast on a switch-to-switch link.** The port forwards instantly, before any election. If that link closes a loop you get a storm. PortFast belongs on ports where an end device lives, and nowhere else.

**MST region mismatch.** Region name, revision number and the VLAN-to-instance map must be byte-identical. One switch with a different revision number silently forms its own region and the boundary behaves as a single instance — traffic engineering you designed quietly stops applying.

**Constant topology changes.** `show spanning-tree detail | include changes` counts them. A flapping access port without PortFast generates a TC on every transition; each TC ages the MAC table down to 15 seconds and forces relearning. Symptom: unexplained unicast flooding and intermittent slowness.

---

<div class="lab">
<div class="lab-head">Lab — elect a root, force a failover, catch a storm safely</div>
<div class="lab-body">

**Build:** three switches, each cabled to the other two. Cisco Modeling Labs, EVE-NG, GNS3 or Packet Tracer all do this. One PC on SW2, one on SW3.

**Task 1 — watch the default election go wrong.**
Leave every priority at default. On each switch run `show spanning-tree vlan 1` and note which switch became root. Record the MAC addresses. Confirm the lowest MAC won, and note that nothing about that switch made it a good choice.

**Task 2 — take control.**
On SW1: `spanning-tree vlan 1 priority 24576`. Re-run `show spanning-tree vlan 1` on all three. Confirm SW1 is root, and identify on SW2 and SW3 which port became Root and which became Alternate. Draw the resulting tree on paper before you look.

**Task 3 — prove cost beats topology.**
On SW3, make the direct link to SW1 slow: `interface <link-to-SW1>` then `spanning-tree cost 200000`. Watch the root port move to the SW2-facing link. Confirm with `show spanning-tree vlan 1` and a `traceroute`-equivalent — check the MAC table path.

**Task 4 — time a failover.**
Start a continuous ping between the two PCs. Shut the active link. Count lost pings. Repeat with `spanning-tree mode pvst` instead of `rapid-pvst` and compare — you should see roughly 30 seconds versus under a second.

**Task 5 — capture a BPDU.**
Mirror a trunk port to a PC running Wireshark (`monitor session 1 source interface ...` / `destination interface ...`). Filter on `stp`. Open one BPDU and find, by eye: the Root ID, the Root Path Cost, the sender's Bridge ID, and the Port ID. Confirm the priority field shows the VLAN added on.

**Task 6 — trigger the guards.**
Put `spanning-tree portfast` and `spanning-tree bpduguard enable` on SW2's PC port. Now move the cable from the PC to SW3. The port should err-disable within a second. Confirm with `show interfaces status err-disabled`, then recover with `shutdown` / `no shutdown`.

**Task 7 — cause a storm, on purpose, in a lab only.**
Disable spanning tree on all three switches for VLAN 1 (`no spanning-tree vlan 1`). Send one broadcast ping. Watch CPU with `show processes cpu sorted`. Re-enable spanning tree to recover. Do this once, in a simulator, so you never have to see it in production.

**What to record:** the BPDU screenshot from Task 5, your ping-loss counts from Task 4, and your hand-drawn tree from Task 2 next to the real output.

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A switch shows <code>Bridge ID Priority 32778</code> for VLAN 10. What is the configured priority?</p>
<label class="qz-opt"><input type="radio" name="stpq1"><span>32778 — that is the value that was set</span><em class="qz-fb qz-bad">The displayed value includes the VLAN. The configured priority is a multiple of 4096.</em></label>
<label class="qz-opt"><input type="radio" name="stpq1"><span>32768, with the VLAN ID of 10 added by the extended system ID</span><em class="qz-fb qz-good">Right. 32768 + 10. Priority is settable only in steps of 4096; the 12-bit extended system ID carries the VLAN.</em></label>
<label class="qz-opt"><input type="radio" name="stpq1"><span>10 — the VLAN number is the priority</span><em class="qz-fb qz-bad">The VLAN is added to the priority, not used as it.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Two switches both reach the root at cost 20000 over the segment between them. What decides which port is designated?</p>
<label class="qz-opt"><input type="radio" name="stpq2"><span>The lower sender Port ID</span><em class="qz-fb qz-bad">Port ID is checked, but only after Bridge ID.</em></label>
<label class="qz-opt"><input type="radio" name="stpq2"><span>The lower Bridge ID of the two switches</span><em class="qz-fb qz-good">Correct. Cost first, then sender Bridge ID, then sender Port ID, then local Port ID.</em></label>
<label class="qz-opt"><input type="radio" name="stpq2"><span>Whichever port came up first</span><em class="qz-fb qz-bad">Spanning tree is deterministic — nothing depends on ordering or timing.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A blocked port on a fibre link stops receiving BPDUs because one strand broke. Which feature stops the loop?</p>
<label class="qz-opt"><input type="radio" name="stpq3"><span>BPDU Guard</span><em class="qz-fb qz-bad">BPDU Guard acts when a BPDU <em>arrives</em> on a PortFast port. Here the problem is BPDUs stopping.</em></label>
<label class="qz-opt"><input type="radio" name="stpq3"><span>Root Guard</span><em class="qz-fb qz-bad">Root Guard acts on a <em>superior</em> BPDU arriving, to protect root placement.</em></label>
<label class="qz-opt"><input type="radio" name="stpq3"><span>Loop Guard</span><em class="qz-fb qz-good">Yes. Loop Guard puts a non-designated port that stops hearing BPDUs into loop-inconsistent rather than letting it unblock. UDLD solves the same failure at Layer 1.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span><code>show spanning-tree</code> reports a port as <code>Type Shr</code> on a switch-to-switch link. What should you check?</p>
<label class="qz-opt"><input type="radio" name="stpq4"><span>Duplex — RSTP infers point-to-point from full duplex</span><em class="qz-fb qz-good">Exactly. Half duplex means shared, which disables proposal/agreement and falls back to timers. Check for a duplex mismatch.</em></label>
<label class="qz-opt"><input type="radio" name="stpq4"><span>The VLAN allowed list on the trunk</span><em class="qz-fb qz-bad">Allowed VLANs do not affect link type.</em></label>
<label class="qz-opt"><input type="radio" name="stpq4"><span>Nothing — Shr is normal between switches</span><em class="qz-fb qz-bad">It is not. A modern switch-to-switch link should read P2p.</em></label>
</div>

---

## References

- **IEEE 802.1D-2004** — Media Access Control (MAC) Bridges. The base standard; 802.1w was folded into it.
- **IEEE 802.1w** — Rapid Reconfiguration of Spanning Tree.
- **IEEE 802.1s** — Multiple Spanning Trees, now part of 802.1Q.
- Cisco — [Understanding Rapid Spanning Tree Protocol (802.1w)](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/24062-146.html)
- Cisco — [Understanding and Configuring Spanning Tree Protocol (STP) on Catalyst Switches](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/5234-5.html)
- Cisco — [Spanning Tree PortFast, BPDU Guard, Root Guard, Loop Guard and UDLD](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/10556-16.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide) — every blueprint topic, with a lab for each.*
