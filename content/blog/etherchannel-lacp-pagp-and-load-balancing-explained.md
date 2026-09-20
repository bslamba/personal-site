---
title: "EtherChannel: LACP, PAgP, and Why Your 4-Gig Bundle Only Moves 1 Gig"
excerpt: "Four cables, one logical link, and spanning tree stops blocking three of them. That much is easy. The parts that catch people are subtler: a bundle is only as good as its hash, a single TCP session never uses more than one member no matter how many you add, mode 'on' will happily build a loop, and a dozen interface settings must match exactly or the port silently refuses to join."
date: "2026-09-21"
tags: ["EtherChannel", "LACP", "PAgP", "Port-channel", "Switching", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.1.b *Troubleshoot static and dynamic EtherChannels*. CCNA 200-301 — 2.4 *Configure and verify (Layer 2/Layer 3) EtherChannel (LACP)*.

## Cheat sheet

| | **PAgP** | **LACP** |
|---|---|---|
| **Standard** | Cisco proprietary | **IEEE 802.1AX** (was 802.3ad) |
| **Modes** | `auto` · `desirable` | `passive` · `active` |
| **Forms a channel** | desirable+desirable · desirable+auto | active+active · active+passive |
| **Never forms** | **auto + auto** | **passive + passive** |
| **Destination MAC** | `01:00:0C:CC:CC:CC` | `01:80:C2:00:00:02` |
| **EtherType** | SNAP, PID `0x0104` | **`0x8809`** (Slow Protocols), subtype 1 |
| **Timers** | 30 s hello | **slow 30 s · fast 1 s**, timeout 3× |
| **Max members** | 8 | **16 configured — 8 active, 8 hot-standby** |

| | |
|---|---|
| **Mode `on`** | No negotiation at all. Both ends must be `on`. **`on` + anything else = broken, and possibly a loop** |
| **Default load balance** | `src-mac` on most Catalyst; `src-dst-mixed-ip-port` on some high-end |
| **Default LACP system priority** | 32768 · **port priority** 32768. Lower wins |
| **What STP sees** | **One port.** That is the entire reason this exists |

**The sentence people need.** An EtherChannel does not give one conversation more bandwidth. It gives *many* conversations more bandwidth. A single flow is hashed onto exactly one member and stays there.

---

## The problem: spanning tree does its job

Run two cables between two switches for redundancy and spanning tree blocks one of them. That is correct behaviour — two active paths between the same pair of switches is a loop — but it means your second cable is doing nothing at all until the first one fails.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spanning tree blocks the redundant link between two switches; an EtherChannel makes both links one logical port so both forward">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .up{stroke:#1f9d6b;stroke-width:3}.blk{stroke:#D3002D;stroke-width:2.5;stroke-dasharray:6 5}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.06em}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
  </style>
  <text class="hdr" x="14" y="16" fill="#D3002D">TWO CABLES, NO BUNDLE</text>
  <rect class="n" x="24" y="60" width="60" height="44" rx="3"/><text class="nt" x="54" y="87" text-anchor="middle">SW1</text>
  <rect class="n" x="212" y="60" width="60" height="44" rx="3"/><text class="nt" x="242" y="87" text-anchor="middle">SW2</text>
  <line class="up" x1="84" y1="72" x2="212" y2="72"/>
  <line class="blk" x1="84" y1="92" x2="212" y2="92"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 84 72 L 212 72"/></circle>
  <text class="s" x="148" y="66" text-anchor="middle" fill="#0f6b47">forwarding</text>
  <text class="s" x="148" y="110" text-anchor="middle" fill="#D3002D">BLOCKING — spanning tree</text>
  <text class="k" x="148" y="140" text-anchor="middle" fill="#D3002D">1 Gbps usable out of 2</text>
  <text class="s" x="148" y="156" text-anchor="middle">and a 2–30 s reconvergence when it fails</text>
  <line x1="320" y1="14" x2="320" y2="176" stroke="#ECECEF"/>
  <text class="hdr" x="368" y="16" fill="#0f6b47">THE SAME TWO CABLES, BUNDLED</text>
  <rect class="n" x="378" y="60" width="60" height="44" rx="3"/><text class="nt" x="408" y="87" text-anchor="middle">SW1</text>
  <rect class="n" x="556" y="60" width="60" height="44" rx="3"/><text class="nt" x="586" y="87" text-anchor="middle">SW2</text>
  <line class="up" x1="438" y1="72" x2="556" y2="72"/>
  <line class="up" x1="438" y1="92" x2="556" y2="92"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 438 72 L 556 72"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.6s" begin="0.4s" repeatCount="indefinite" path="M 438 92 L 556 92"/></circle>
  <rect x="432" y="58" width="130" height="48" fill="none" stroke="#1f9d6b" stroke-dasharray="4 3"/>
  <text class="s" x="497" y="122" text-anchor="middle" fill="#0f6b47">Po1 — one logical port</text>
  <text class="k" x="497" y="140" text-anchor="middle" fill="#0f6b47">2 Gbps usable</text>
  <text class="s" x="497" y="156" text-anchor="middle">and sub-second failover, with no STP event</text>
  <rect x="14" y="188" width="612" height="50" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="s" x="26" y="208" font-weight="700" fill="#17171A">Why STP allows it:</text>
  <text class="s" x="138" y="208">spanning tree is never shown the physical ports. It sees one interface, Po1, sends and</text>
  <text class="s" x="26" y="224">receives BPDUs on it alone, and has no loop to break. Losing a member is not a topology change.</text>
</svg>
<figcaption><b>Figure 1.</b> The bandwidth is the obvious benefit. The failover behaviour is the better one: a member failure is invisible to spanning tree, so nothing recalculates and nothing re-learns.</figcaption>
</figure>

---

## How a bundle forms

Two protocols can negotiate it, and one option skips negotiation entirely.

<div class="walk">
<div class="walk-head">LACP — from two loose cables to one bundle <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="lacp" id="la1" checked><label for="la1"><span class="step-n">1</span>Independent</label>
  <input type="radio" name="lacp" id="la2"><label for="la2"><span class="step-n">2</span>LACPDUs</label>
  <input type="radio" name="lacp" id="la3"><label for="la3"><span class="step-n">3</span>Synchronised</label>
  <input type="radio" name="lacp" id="la4"><label for="la4"><span class="step-n">4</span>Bundled</label>
  <input type="radio" name="lacp" id="la5"><label for="la5"><span class="step-n">5</span>A member dies</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two links are up but each is an independent port and spanning tree blocks one">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.up{stroke:#1f9d6b;stroke-width:3}.blk{stroke:#D3002D;stroke-width:2.5;stroke-dasharray:6 5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}</style>
  <rect class="n" x="120" y="62" width="70" height="50" rx="3"/><text class="nt" x="155" y="92" text-anchor="middle">SW1</text>
  <rect class="n" x="450" y="62" width="70" height="50" rx="3"/><text class="nt" x="485" y="92" text-anchor="middle">SW2</text>
  <line class="up" x1="190" y1="76" x2="450" y2="76"/>
  <line class="blk" x1="190" y1="98" x2="450" y2="98"/>
  <text class="s" x="320" y="68" text-anchor="middle">Gi1/0/1 — forwarding</text>
  <text class="s" x="320" y="118" text-anchor="middle" fill="#D3002D">Gi1/0/2 — blocked by STP</text>
  <text class="k" x="320" y="150" text-anchor="middle">Two ports, two BPDU conversations, one loop for spanning tree to break.</text>
</svg>
<p class="walk-say"><span class="walk-title">Before anything is configured</span>
Both cables are plugged in and both interfaces are up. Spanning tree sees two paths between the same two bridges, elects one, and blocks the other. Half the cabling you paid for is idle, and it will stay idle until something breaks.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Both switches exchange LACP protocol data units describing themselves and what they hear">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.b{stroke:#4b7bec;stroke-width:2.5;fill:none}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#2b5ab8}</style>
  <rect class="n" x="120" y="66" width="70" height="50" rx="3"/><text class="nt" x="155" y="96" text-anchor="middle">SW1</text>
  <rect class="n" x="450" y="66" width="70" height="50" rx="3"/><text class="nt" x="485" y="96" text-anchor="middle">SW2</text>
  <line class="l" x1="190" y1="80" x2="450" y2="80"/>
  <line class="l" x1="190" y1="102" x2="450" y2="102"/>
  <path class="b" d="M 194 74 L 446 74"/>
  <path class="b" d="M 446 108 L 194 108"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 194 74 L 446 74"/></circle>
  <circle r="5" fill="#4b7bec"><animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 446 108 L 194 108"/></circle>
  <text class="k" x="320" y="62" text-anchor="middle">LACPDU → dst 01:80:C2:00:00:02 · EtherType 0x8809 · 110 bytes</text>
  <text class="s" x="320" y="132" text-anchor="middle">Each PDU says: here is my Actor — system ID, key, port, state.</text>
  <text class="s" x="320" y="148" text-anchor="middle">And here is the Partner I currently hear. That second half is how each side knows it is being heard.</text>
  <text class="s" x="320" y="172" text-anchor="middle">At least one end must be <tspan font-weight="700">active</tspan>. Two passive ends send nothing and wait forever.</text>
</svg>
<p class="walk-say"><span class="walk-title">Each end describes itself, and what it hears</span>
An LACPDU has two halves. The <b>Actor</b> block is "this is me". The <b>Partner</b> block is "this is who I believe is on the other end". When SW2 sees its own identity correctly reflected in SW1's Partner block, it knows the link is bidirectional and that SW1 is talking to the right device — which is also how LACP protects you from a unidirectional fibre.
<br><br>The <b>key</b> is what groups ports together: members of the same bundle share a key, derived from speed, duplex and VLAN configuration. Two ports with different keys will never aggregate, which is the mechanism behind most "port not bundling" faults.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The actor state flags reach the synchronised collecting and distributing state">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}.m{font-family:ui-monospace,Menlo,monospace;font-size:11px}.on{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.off{fill:#F1EEE9;stroke:#B5B5BC}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <text class="hdr" x="14" y="18">ACTOR STATE — ONE BYTE, EIGHT FLAGS</text>
  <rect class="on"  x="14"  y="30" width="74" height="30"/><text class="m" x="51"  y="50" text-anchor="middle" fill="#0f6b47">Activity</text>
  <rect class="off" x="90"  y="30" width="74" height="30"/><text class="m" x="127" y="50" text-anchor="middle" fill="#8A8A93">Timeout</text>
  <rect class="on"  x="166" y="30" width="74" height="30"/><text class="m" x="203" y="50" text-anchor="middle" fill="#0f6b47">Aggreg</text>
  <rect class="on"  x="242" y="30" width="74" height="30"/><text class="m" x="279" y="50" text-anchor="middle" fill="#0f6b47">Sync</text>
  <rect class="on"  x="318" y="30" width="74" height="30"/><text class="m" x="355" y="50" text-anchor="middle" fill="#0f6b47">Collect</text>
  <rect class="on"  x="394" y="30" width="74" height="30"/><text class="m" x="431" y="50" text-anchor="middle" fill="#0f6b47">Distrib</text>
  <rect class="off" x="470" y="30" width="74" height="30"/><text class="m" x="507" y="50" text-anchor="middle" fill="#8A8A93">Default</text>
  <rect class="off" x="546" y="30" width="74" height="30"/><text class="m" x="583" y="50" text-anchor="middle" fill="#8A8A93">Expired</text>
  <text class="s" x="14" y="74">0x01</text><text class="s" x="90" y="74">0x02</text><text class="s" x="166" y="74">0x04</text><text class="s" x="242" y="74">0x08</text>
  <text class="s" x="318" y="74">0x10</text><text class="s" x="394" y="74">0x20</text><text class="s" x="470" y="74">0x40</text><text class="s" x="546" y="74">0x80</text>
  <text class="k" x="14" y="102" fill="#0f6b47">0x01 + 0x04 + 0x08 + 0x10 + 0x20 = 0x3D — a healthy, bundled, forwarding member</text>
  <text class="s" x="14" y="126">Sync means &#8220;my partner and I agree which bundle this port is in&#8221;.</text>
  <text class="s" x="14" y="142">Collecting means &#8220;I will accept frames on it&#8221;. Distributing means &#8220;I will send frames on it&#8221;.</text>
  <text class="k" x="14" y="170" fill="#D3002D">0x05 — Activity and Aggregation only: the port hears LACP but has not synchronised. Look at the key.</text>
</svg>
<p class="walk-say"><span class="walk-title">Read the state byte and you have diagnosed it</span>
This single byte answers "why is my port not bundling" faster than any show command. <b>0x3D</b> is a member doing its job. Anything missing <code>Sync</code> means the two ends have not agreed the port belongs to the same aggregation — a mismatched speed, duplex, allowed VLAN list or native VLAN. <code>Expired</code> set means LACPDUs stopped arriving; <code>Defaulted</code> means this end gave up waiting and fell back to its configured assumption.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Both links now form one logical port channel interface carrying traffic on both members">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.up{stroke:#1f9d6b;stroke-width:3.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}</style>
  <rect class="n" x="120" y="62" width="70" height="52" rx="3"/><text class="nt" x="155" y="92" text-anchor="middle">SW1</text>
  <rect class="n" x="450" y="62" width="70" height="52" rx="3"/><text class="nt" x="485" y="92" text-anchor="middle">SW2</text>
  <line class="up" x1="190" y1="76" x2="450" y2="76"/>
  <line class="up" x1="190" y1="100" x2="450" y2="100"/>
  <rect x="186" y="60" width="268" height="56" fill="none" stroke="#1f9d6b" stroke-dasharray="5 4"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 190 76 L 450 76"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.5s" begin="0.35s" repeatCount="indefinite" path="M 190 100 L 450 100"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.5s" begin="0.7s" repeatCount="indefinite" path="M 190 76 L 450 76"/></circle>
  <text class="k" x="320" y="140" text-anchor="middle">Port-channel1 — the only interface STP, VLANs and routing ever see</text>
  <text class="s" x="320" y="160" text-anchor="middle">Configuration now belongs on Po1. Changes made on a member are the classic way to knock it out of the bundle.</text>
</svg>
<p class="walk-say"><span class="walk-title">One interface from here on</span>
The physical ports still exist, but everything above Layer 1 now happens on <code>Port-channel1</code>. Put your trunk configuration, your access VLAN, your IP address, your storm control and your spanning tree settings <b>on the Po interface</b>. IOS copies Po settings down to members, and a setting applied to only one member creates a mismatch that suspends it.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One member fails and the bundle keeps forwarding on the remaining member with no spanning tree recalculation">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.up{stroke:#1f9d6b;stroke-width:3.5}.dead{stroke:#D3002D;stroke-width:2.5;stroke-dasharray:5 4}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect class="n" x="120" y="62" width="70" height="52" rx="3"/><text class="nt" x="155" y="92" text-anchor="middle">SW1</text>
  <rect class="n" x="450" y="62" width="70" height="52" rx="3"/><text class="nt" x="485" y="92" text-anchor="middle">SW2</text>
  <line class="up" x1="190" y1="76" x2="450" y2="76"/>
  <line class="dead" x1="190" y1="100" x2="450" y2="100"/>
  <line x1="308" y1="92" x2="326" y2="108" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="326" y1="92" x2="308" y2="108" stroke="#D3002D" stroke-width="2.5"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.3s" repeatCount="indefinite" path="M 190 76 L 450 76"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.3s" begin="0.4s" repeatCount="indefinite" path="M 190 76 L 450 76"/></circle>
  <text class="k" x="320" y="140" text-anchor="middle" fill="#0f6b47">Po1 stays up. No STP event. No MAC flush. Sub-second.</text>
  <text class="s" x="320" y="162" text-anchor="middle">Flows that were hashed onto the dead member are rehashed onto the survivor.</text>
  <text class="s" x="320" y="180" text-anchor="middle">Flows already on the survivor are untouched — which is why failover is barely visible.</text>
</svg>
<p class="walk-say"><span class="walk-title">Losing a leg is not a topology change</span>
This is the benefit that matters more than bandwidth. When a member dies, the logical interface stays up, so spanning tree never runs, no MAC addresses are flushed and no forwarding state is rebuilt anywhere in the network. Compare that with losing a plain redundant link, where every switch in the domain may re-learn.
<br><br>The exception worth knowing: <code>port-channel min-links</code>. Set it, and the bundle deliberately goes <b>down</b> when fewer than N members survive — useful when half the bandwidth is worse than failing over to another path entirely.</p>
</div>
</div>
</div>

### An LACPDU in full

<div class="cap">
<div class="cap-head">Capture · member port, bundle up <span class="cap-filter">lacp</span></div>
<div class="cap-tree"><pre>▾ Ethernet II
    <span class="f">Destination:</span> <span class="v">Slow-Protocols-Multicast (<mark>01:80:c2:00:00:02</mark>)</span>
    <span class="f">Type:</span> <span class="v">Slow Protocols (<mark>0x8809</mark>)</span>
▾ Link Aggregation Control Protocol
    <span class="f">Subtype:</span> <span class="v">LACP (0x01)</span>   <span class="f">Version:</span> <span class="v">1</span>
  ▾ <span class="f">Actor Information</span>
      <span class="f">System Priority:</span> <span class="v">32768</span>
      <span class="f">System ID:</span> <span class="v">00:aa:bb:cc:dd:00</span>
      <span class="f">Key:</span> <span class="v"><mark>0x0005</mark></span>              ← ports that share a key can aggregate
      <span class="f">Port Priority:</span> <span class="v">32768</span>   <span class="f">Port:</span> <span class="v">2</span>
      <span class="f">State:</span> <span class="v"><mark>0x3d</mark></span>
        <span class="f">.... ...1</span> = <span class="v">LACP Activity: Active</span>
        <span class="f">.... .1..</span> = <span class="v">Aggregation: Aggregatable</span>
        <span class="f">.... 1...</span> = <span class="v">Synchronization: In Sync</span>
        <span class="f">...1 ....</span> = <span class="v">Collecting: Yes</span>
        <span class="f">..1. ....</span> = <span class="v">Distributing: Yes</span>
  ▾ <span class="f">Partner Information</span>
      <span class="f">System ID:</span> <span class="v">00:33:44:55:66:00</span>   <span class="f">Key:</span> <span class="v">0x0005</span>   <span class="f">State:</span> <span class="v"><mark>0x3d</mark></span></pre></div>
<div class="cap-hex"><pre>0000  <mark>01 80 c2 00 00 02</mark> 00 aa  bb cc dd 02 <mark>88 09</mark> 01 01   ................
0010  01 14 80 00 00 aa bb cc  dd 00 <mark>00 05</mark> 80 00 00 02   ................
0020  <mark>3d</mark> 00 00 00 02 14 80 00  00 33 44 55 66 00 <mark>00 05</mark>   =........3DUf...
0030  80 00 00 02 <mark>3d</mark> 00 00 00  03 10 00 00 00 00 00 00   ....=...........
0040  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00   ................</pre></div>
<div class="cap-note"><b>Two bytes tell you everything.</b> The <code>3d</code> at offset 0x20 is the Actor state; the <code>3d</code> at 0x34 is the Partner's. <b>Both 0x3D means the bundle is healthy from both directions.</b> If your local port shows 0x3D and the partner shows 0x05, your end is ready and theirs is not — go and look at their configuration, not yours. Note also the two <code>00 05</code> keys: they match, which is why these ports are allowed to aggregate at all. Every LACPDU is padded to a fixed 110 bytes, which is why the rest is zeroes.</div>
</div>

---

## Mode `on` — the one that builds loops

`channel-group 1 mode on` creates the bundle with no protocol at all. Both switches simply decide the ports are one interface.

<div class="warn">
<b>Why this is the dangerous option</b>
With LACP or PAgP, a bundle only forms when both ends agree. With <code>on</code>, <b>your switch bundles regardless of what the other end thinks</b>. Configure <code>on</code> at one end and leave the other as individual ports, and you have created exactly the thing spanning tree exists to prevent: your end treats two links as one port and stops expecting BPDUs to be meaningful per-link, while the far end treats them as two independent forwarding paths. The result is a bridging loop, in a part of the network specifically built for resilience.
<br><br>Use <code>on</code> only where a protocol genuinely cannot run — some hypervisor uplinks, some load balancers — and only with both ends verified by hand. Everywhere else, use <b>LACP active on both ends</b>. It is standards-based, it detects unidirectional links, and it refuses to build a bundle that the far end has not agreed to.
</div>

---

## Load balancing: the part that disappoints people

Four gigabit members do not make a four-gigabit pipe. The switch runs a **hash** over selected fields of each frame and the result picks a member. Same fields in, same member out — always.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A hash over addresses assigns each flow to one member link, so a single large flow cannot exceed one member's speed">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .lk{stroke:#B5B5BC;stroke-width:2.5}
    .hash{fill:#F1EEE9;stroke:#17171A}
    .m{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;fill:#17171A}
  </style>
  <text class="s" x="14" y="26">flow A  10.1.1.5 → 10.2.2.9</text>
  <text class="s" x="14" y="48">flow B  10.1.1.6 → 10.2.2.9</text>
  <text class="s" x="14" y="70">flow C  10.1.1.7 → 10.2.2.9</text>
  <text class="s" x="14" y="92">flow D  10.1.1.5 → 10.2.2.9</text>
  <text class="s" x="14" y="106" fill="#D3002D">(a second session, same pair)</text>
  <rect class="hash" x="196" y="20" width="96" height="90" rx="3"/>
  <text class="m" x="244" y="52" text-anchor="middle">HASH</text>
  <text class="m" x="244" y="70" text-anchor="middle">src-dst-ip</text>
  <text class="s" x="244" y="90" text-anchor="middle">→ member</text>
  <line class="lk" x1="180" y1="22" x2="196" y2="50"/>
  <line class="lk" x1="180" y1="44" x2="196" y2="56"/>
  <line class="lk" x1="180" y1="66" x2="196" y2="66"/>
  <line class="lk" x1="180" y1="88" x2="196" y2="76"/>
  <line class="lk" x1="292" y1="40" x2="400" y2="30"/>
  <line class="lk" x1="292" y1="56" x2="400" y2="70"/>
  <line class="lk" x1="292" y1="72" x2="400" y2="110"/>
  <rect class="n" x="400" y="16" width="150" height="26" rx="3"/><text class="nt" x="475" y="34" text-anchor="middle">Gi1/0/1 — flow A + D</text>
  <rect class="n" x="400" y="56" width="150" height="26" rx="3"/><text class="nt" x="475" y="74" text-anchor="middle">Gi1/0/2 — flow B</text>
  <rect class="n" x="400" y="96" width="150" height="26" rx="3"/><text class="nt" x="475" y="114" text-anchor="middle">Gi1/0/3 — flow C</text>
  <rect class="n" x="400" y="136" width="150" height="26" rx="3" opacity=".35"/><text class="nt" x="475" y="154" text-anchor="middle">Gi1/0/4 — idle</text>
  <text class="k" x="14" y="150" fill="#D3002D">Flows A and D share a member because the hash inputs are identical.</text>
  <text class="s" x="14" y="166">No amount of extra cable changes that. To spread them you must hash on something that differs — add the ports.</text>
  <rect x="14" y="184" width="612" height="54" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="204" fill="#B80027">The backup-server problem</text>
  <text class="s" x="26" y="220">One server backing up to one target is one flow: one src IP, one dst IP, one port pair. It will use exactly</text>
  <text class="s" x="26" y="234">one member of an eight-member bundle, for ever, and adding members will never make it faster.</text>
</svg>
<figcaption><b>Figure 2.</b> The hash is deterministic, not adaptive. It does not look at how busy the links are, and it does not move an established flow to balance load.</figcaption>
</figure>

<div class="cmd">
<div class="cmd-line"><span class="t">port-channel load-balance</span> <span class="opt">src-dst-ip</span>   <span class="opt">! global, and it is a global setting</span></div>
<dl class="cmd-parts">
<div><dt>src-mac / dst-mac</dt><dd>The common default on Catalyst. Fine between access and distribution, where many hosts talk through one router. <b>Terrible on a link where one router's MAC is the source of everything</b> — every frame hashes identically and you get one busy member.</dd></div>
<div><dt>src-dst-mac</dt><dd>Better, but still degenerate when traffic crosses a routed boundary, because the MACs become the two routers' and nothing varies.</dd></div>
<div class="is-key"><dt>src-dst-ip</dt><dd>The sane default for most uplinks. Varies per host pair, survives a routed hop, and is supported everywhere.</dd></div>
<div class="is-key"><dt>src-dst-port /<br>src-dst-mixed-ip-port</dt><dd>Adds Layer 4 ports so that <b>two sessions between the same pair of hosts can land on different members</b>. This is the one that fixes the backup-server problem — if the platform supports it.</dd></div>
<div><dt>(global)</dt><dd>On most Catalyst platforms this is a <b>switch-wide</b> setting, not per port-channel. Changing it affects every bundle on the box, and it is applied on <b>egress</b> — the two ends of a link can and often do use different methods, which is legal and fine.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
"We upgraded to a 4 × 10G bundle and the backup still takes nine hours." It will. One backup job is one flow. Before adding members to a bundle, run <code>show etherchannel load-balance</code> to see the method, then <code>show interfaces port-channel1 counters</code> per member — if one member carries 90% of the traffic, the answer is a better hash or more parallel sessions, not more cable. Cisco even gives you a way to ask directly: <code>test etherchannel load-balance interface Po1 ip 10.1.1.5 10.2.2.9</code> tells you which member a given flow will take.
</div>

---

## What must match

A port that will not join a bundle almost always fails one of these. They must be identical on **every member, at both ends**:

- **Speed and duplex**
- **Trunk or access mode**, and for trunks the **native VLAN** and the **allowed VLAN list**
- For access ports, the **access VLAN**
- **Spanning tree cost and port priority** per VLAN, and **PortFast** setting
- **Same switch** (unless you are using StackWise, VSS or vPC)

<div class="cmd">
<div class="cmd-line">interface range GigabitEthernet1/0/1 - 2
 <span class="t">channel-protocol lacp</span>
 <span class="t">channel-group</span> <span class="opt">1</span> <span class="t">mode active</span>
!
interface Port-channel1
 <span class="t">switchport mode trunk</span>
 <span class="t">switchport trunk allowed vlan</span> <span class="opt">10,20</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>interface range</dt><dd>Configure members <b>together</b>, always. Configuring them one at a time creates a window where they differ, and a port that joins with different settings will be suspended.</dd></div>
<div><dt>channel-protocol lacp</dt><dd>Optional — the mode keyword implies it. Worth including so the intent survives someone later typing <code>mode desirable</code> by habit.</dd></div>
<div class="is-key"><dt>channel-group 1<br>mode active</dt><dd>Creates <code>Port-channel1</code> if it does not exist and puts these ports in it. <b>active</b> = LACP, initiates. <b>passive</b> = LACP, waits. <b>desirable</b>/<b>auto</b> = PAgP. <b>on</b> = no protocol. The number is <b>locally significant</b> — the two switches need not use the same channel-group number, though using the same one saves confusion at 3am.</dd></div>
<div class="is-key"><dt>interface Port-channel1</dt><dd>Everything above Layer 1 goes here. For a <b>Layer 3</b> EtherChannel, put <code>no switchport</code> and an IP address on this interface — and put <code>no switchport</code> on the members too, <em>before</em> adding them to the group.</dd></div>
</dl>
</div>

### Reading a bundle

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — the flags are the diagnosis</div>
<pre><span class="p">SW1#</span> <span class="c">show etherchannel summary</span>
Flags:  D - down        P - bundled in port-channel
        I - stand-alone <span class="r">s - suspended</span>
        H - Hot-standby (LACP only)
        R - Layer3      S - Layer2
        U - in use      <span class="r">f - failed to allocate aggregator</span>
        <span class="r">M - not in use, minimum links not met</span>

Number of channel-groups in use: 2

Group  Port-channel  Protocol    Ports
------+-------------+-----------+----------------------------------------
1      <span class="g">Po1(SU)</span>       LACP        <span class="g">Gi1/0/1(P)</span>   <span class="g">Gi1/0/2(P)</span>
2      <span class="r">Po2(SD)</span>       LACP        <span class="r">Gi1/0/3(s)</span>   Gi1/0/4(D)

<span class="o">! Po1: S = Layer 2, U = in use. Both members (P) = bundled. This is health.</span>
<span class="o">! Po2: (s) = suspended — the port is up but refuses to join. (D) = simply down.</span>
<span class="o">! Suspended is never a cable fault. It is always a configuration mismatch.</span>

<span class="p">SW1#</span> <span class="c">show lacp neighbor</span>
Flags:  S - Device is requesting Slow LACPDUs
        F - Device is requesting Fast LACPDUs
        A - Device is in Active mode    P - Device is in Passive mode

Channel group 1 neighbors
                  LACP port                        Admin  Oper   Port    Port
Port      Flags   Priority  Dev ID          Age    key    Key    Number  State
Gi1/0/1   <span class="g">SA</span>      32768     0033.4455.6600  12s    0x0    0x5    0x1     <span class="g">0x3D</span>
Gi1/0/2   <span class="g">SA</span>      32768     0033.4455.6600  19s    0x0    0x5    0x2     <span class="g">0x3D</span>

<span class="p">SW1#</span> <span class="c">test etherchannel load-balance interface Po1 ip 10.1.1.5 10.2.2.9</span>
Would select <span class="y">Gi1/0/1</span> of Po1<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Three commands, in order.</b> <code>summary</code> tells you whether it bundled. <code>lacp neighbor</code> tells you what the far end thinks, and its <code>0x3D</code> is the same state byte you saw in the capture. <code>test etherchannel load-balance</code> answers "which member will this flow take?" without touching a single packet — the fastest way to settle an argument about load distribution.</p>

---

## What goes wrong

**Port shows `(s)` suspended.** A setting differs between the members or between the ends. Compare speed, duplex, trunk mode, native VLAN and allowed list. The log usually names the mismatch.

**Port shows `(I)` stand-alone.** No LACP was heard. Either the far end is not configured, is `passive` while you are `passive`, or is running PAgP against your LACP.

**Port shows `(H)` hot-standby.** Normal with more than eight members — LACP bundles eight and holds the rest in reserve. Not a fault.

**Bundle forms, then breaks, repeatedly.** Often a duplex or flow-control mismatch, or LACP fast timers on an over-subscribed CPU. Check `show interfaces counters errors` on the members.

**Everything looks perfect but throughput is one member's worth.** The hash. Not a fault — a design choice you have not made yet.

**A loop after a change.** Somebody used `mode on` at one end. Check `show etherchannel summary` protocol column on both ends; a blank protocol is `on`.

**A Layer 3 EtherChannel refuses an IP address.** `no switchport` was applied after the members joined. Remove the members, set `no switchport` on all of them and the Po, then re-add.

---

<div class="lab">
<div class="lab-head">Lab — bundle it, break it, and prove the hash</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build both a Layer 2 and a Layer 3 EtherChannel; read the LACP state byte off the wire and off the CLI and confirm they agree; produce every failure flag — <code>(s)</code>, <code>(I)</code>, <code>(D)</code>, <code>(H)</code> — on purpose so you recognise each from the summary alone; and then measure, with real traffic, that a single flow cannot exceed one member.</div>

**Topology.** SW1 and SW2 with four links between them. Two hosts per switch. A capture machine on a SPAN of one member.

<p class="lab-step"><span class="n">1</span>Watch spanning tree block first</p>

Cable all four links with no channel-group configured.

```cisco
SW1# show spanning-tree vlan 10
```

<div class="lab-watch"><b>Things to notice</b>
One forwarding, three blocking. Note the root port and the cost. Then bundle them and run the same command — the cost <b>changes</b>, because an EtherChannel's STP cost reflects the aggregate bandwidth, not one link. That cost change can move your root port and reshape the topology, which is a real and frequently forgotten side effect of bundling.</div>

<p class="lab-step"><span class="n">2</span>Build it with LACP, both ends active</p>

```cisco
! Both switches
interface range GigabitEthernet1/0/1 - 2
 channel-group 1 mode active
!
interface Port-channel1
 switchport mode trunk
 switchport trunk allowed vlan 10,20
```

```cisco
SW1# show etherchannel summary
SW1# show lacp neighbor
```

<div class="lab-watch"><b>Things to notice</b>
Both members should read <code>(P)</code> and the neighbour state should be <code>0x3D</code>. Now capture on a member with a filter of <code>lacp</code> and find that same <code>3d</code> byte in the hex — the CLI and the wire agreeing is a satisfying thing to have verified once, and it means you can diagnose from either.
<br><br>Also time the LACPDUs: one every 30 s by default. Add <code>lacp rate fast</code> and watch it drop to one per second, and the failure detection time with it.</div>

<p class="lab-step"><span class="n">3</span>Make a port suspend, four different ways</p>

Do each on **one member only**, check `show etherchannel summary`, read the log, then undo.

1. `speed 100` on one member.
2. `switchport trunk native vlan 5` on one member.
3. `switchport trunk allowed vlan 10` on one member.
4. `spanning-tree cost 5` on one member.

<div class="lab-watch"><b>Things to notice</b>
Every one produces <code>(s)</code>, and every one logs a message naming the mismatch — <code>%EC-5-CANNOT_BUNDLE2</code> or similar. Read those messages carefully: they are unusually good, and they are the fastest route to the answer. Notice also that the <b>bundle keeps working</b> on the remaining member throughout. A suspended port is a silent loss of half your capacity, not an outage, so it will not page anybody.</div>

<p class="lab-step"><span class="n">4</span>Produce stand-alone and hot-standby</p>

Set SW2's members to `mode passive` while SW1 is also `passive`. Then put all four links into the group with more than eight members if your hardware allows, or use `lacp max-bundle 1`.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Passive/passive still bundles</b> — you left one end on active. Check both.</li>
<li><b>No <code>(I)</code> flag appears, the ports just go down</b> — some platforms err-disable instead. Check <code>show interfaces status err-disabled</code>.</li>
<li><b>You cannot make eight members</b> — use <code>lacp max-bundle 1</code> on the Po interface to force the rest into <code>(H)</code> hot-standby with only two cables.</li>
<li><b>Everything shows <code>(D)</code></b> — the port-channel interface itself is shut, or the members are. <code>(D)</code> means down, nothing subtler.</li>
</ul></div>

<p class="lab-step"><span class="n">5</span>The dangerous one: mode `on`, one end only</p>

**Do this on an isolated lab only.** Set SW1's ports to `mode on` and remove the channel-group from SW2's ports entirely.

<div class="lab-watch"><b>Things to notice</b>
SW1 believes it has a bundle. SW2 has two independent ports and spanning tree now has BPDUs arriving in a way it cannot reconcile. Depending on platform you will see either a storm, a flapping MAC table (<code>%SW_MATM-4-MACFLAP_NOTIF</code>), or STP putting something into an odd state. Watch the CPU.
<br><br>This is the single best argument for never using <code>on</code>. Undo it immediately, and note how long the network took to settle afterwards.</div>

<p class="lab-step"><span class="n">6</span>Prove one flow uses one member</p>

With a four-member bundle up, run a single large transfer between one host pair — `iperf3 -c <server> -t 60`. Watch the per-member counters:

```cisco
SW1# show interfaces port-channel1 counters
SW1# test etherchannel load-balance interface Po1 ip 10.1.10.5 10.1.20.9
```

Then run **eight parallel sessions between different host pairs** and look again.

<div class="lab-watch"><b>Things to notice</b>
One flow: one member's counters climb and the other three barely move, and <code>test etherchannel load-balance</code> predicted exactly which one before you started. Eight flows across different addresses: the load spreads, though rarely evenly — hashing is not scheduling, and a 60/40 split across two members is normal and not a fault.
<br><br>Now change the method to <code>src-dst-mac</code> and repeat with traffic that crosses a routed hop. Watch it collapse onto one member, because every frame now has the same two MACs. That is the single most useful thing in this lab: you can create the "we bought more bandwidth and got none" situation on demand, and therefore recognise it in production.</div>

<p class="lab-step"><span class="n">7</span>Build a Layer 3 EtherChannel</p>

```cisco
interface range GigabitEthernet1/0/3 - 4
 no switchport
 channel-group 2 mode active
!
interface Port-channel2
 no switchport
 ip address 10.0.12.1 255.255.255.252
```

<div class="lab-watch"><b>Things to notice</b>
Order matters: <code>no switchport</code> on the members <b>before</b> the channel-group, or the Po comes up as Layer 2 and refuses the IP address. The summary now shows <code>(RU)</code> instead of <code>(SU)</code> — R for routed. Run OSPF over it and note that the IGP sees one adjacency and one cost, not four; losing a member changes neither, so the routing protocol never reconverges. That is the same benefit STP got, one layer up.</div>

<div class="lab-earned"><b>What you earned</b>
You can look at one line of <code>show etherchannel summary</code> and know whether the problem is configuration (<code>s</code>), the far end (<code>I</code>), the cable (<code>D</code>) or nothing at all (<code>H</code>). You know that the LACP state byte is the same value on the wire and in the CLI, so you can diagnose from a capture when you have no access to the other switch. You have seen mode <code>on</code> build a loop, which means you will never use it casually. And you can answer the bandwidth question honestly before anyone spends money: more members help more conversations, never one conversation, and you can prove which member any given flow will take without sending a packet.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Both ends are configured <code>channel-group 1 mode passive</code>. What happens?</p>
<label class="qz-opt"><input type="radio" name="ec1"><span>The bundle forms normally</span><em class="qz-fb qz-bad">Passive means "respond, but never initiate". With nobody initiating there is no conversation.</em></label>
<label class="qz-opt"><input type="radio" name="ec1"><span>No bundle — at least one end must be active</span><em class="qz-fb qz-good">Correct, and it is the LACP twin of PAgP's auto+auto problem. The ports stay individual and spanning tree blocks the extras.</em></label>
<label class="qz-opt"><input type="radio" name="ec1"><span>The ports err-disable</span><em class="qz-fb qz-bad">Nothing is wrong enough to err-disable. They simply remain separate ports.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A single backup job runs across a 4 × 10G bundle and peaks at 10 Gbps. Why?</p>
<label class="qz-opt"><input type="radio" name="ec2"><span>One flow hashes to one member and stays there</span><em class="qz-fb qz-good">Right. The hash is per-flow and deterministic. Adding members cannot help a single conversation — only more conversations, or a hash that includes Layer 4 ports, can.</em></label>
<label class="qz-opt"><input type="radio" name="ec2"><span>Three members must be suspended</span><em class="qz-fb qz-bad">Check <code>show etherchannel summary</code> — but a healthy four-member bundle behaves exactly this way for one flow.</em></label>
<label class="qz-opt"><input type="radio" name="ec2"><span>LACP limits throughput to one member until fast timers are enabled</span><em class="qz-fb qz-bad">Timers affect failure detection, never throughput.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span><code>show etherchannel summary</code> shows a member as <code>(s)</code>. What does that tell you?</p>
<label class="qz-opt"><input type="radio" name="ec3"><span>The cable is faulty</span><em class="qz-fb qz-bad">A faulty cable gives you <code>(D)</code> — down. Suspended means the link is fine.</em></label>
<label class="qz-opt"><input type="radio" name="ec3"><span>The port is up but a setting does not match, so it refuses to join</span><em class="qz-fb qz-good">Exactly — speed, duplex, trunk mode, native VLAN, allowed list or STP settings. The log message will usually name it.</em></label>
<label class="qz-opt"><input type="radio" name="ec3"><span>It is a hot-standby member waiting its turn</span><em class="qz-fb qz-bad">That is <code>(H)</code>, and it is normal rather than a fault.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why is mode <code>on</code> riskier than LACP?</p>
<label class="qz-opt"><input type="radio" name="ec4"><span>It bundles regardless of what the far end is doing, so a one-sided configuration can create a loop</span><em class="qz-fb qz-good">Correct. LACP and PAgP will not build a bundle the other end has not agreed to; <code>on</code> has no such safeguard.</em></label>
<label class="qz-opt"><input type="radio" name="ec4"><span>It is slower to converge</span><em class="qz-fb qz-bad">It is arguably faster, having nothing to negotiate. Speed is not the issue — safety is.</em></label>
<label class="qz-opt"><input type="radio" name="ec4"><span>It only supports two members</span><em class="qz-fb qz-bad">Member count is not the limitation.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Which load-balance method best separates two sessions between the same pair of hosts?</p>
<label class="qz-opt"><input type="radio" name="ec5"><span><code>src-dst-mac</code></span><em class="qz-fb qz-bad">Same host pair means the same MACs — and across a routed hop, the same two router MACs for everything.</em></label>
<label class="qz-opt"><input type="radio" name="ec5"><span><code>src-dst-ip</code></span><em class="qz-fb qz-bad">Better, but the same pair of hosts still gives the same two IPs, so both sessions hash identically.</em></label>
<label class="qz-opt"><input type="radio" name="ec5"><span><code>src-dst-mixed-ip-port</code></span><em class="qz-fb qz-good">Correct — only adding the Layer 4 ports makes two sessions between one host pair differ, because the source port is what changes between them.</em></label>
</div>

---

## References

- **IEEE 802.1AX** — Link Aggregation. The LACPDU format, the state flags and the Actor/Partner model come from it. It absorbed the old 802.3ad.
- Cisco — [Configuring EtherChannels](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9500/software/release/17-13/configuration_guide/lyr2/b_1713_lyr2_9500_cg/configuring_etherchannels.html) — the mode matrix, the settings that must match, and the 16-configured/8-active limit.
- Cisco — [Understand EtherChannel Load Balance and Redundancy on Catalyst Switches](https://www.cisco.com/c/en/us/support/docs/lan-switching/etherchannel/12023-4.html) — the definitive explanation of the hash.
- Cisco — [EtherChannel Between Catalyst Switches Configuration Example](https://www.cisco.com/c/en/us/support/docs/lan-switching/etherchannel/98469-etherchannel-cat-switches.html)

---

*Next in ENCOR 3.1: [MST — one spanning tree for many VLANs](/blog/mst-multiple-spanning-tree-regions-instances-explained). Before it: [802.1Q trunking, the native VLAN and DTP](/blog/dot1q-trunking-native-vlan-and-dtp-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
