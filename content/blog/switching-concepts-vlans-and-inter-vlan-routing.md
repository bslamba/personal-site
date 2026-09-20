---
title: "Switching and VLANs: MAC Learning, Flooding, Access Ports and Inter-VLAN Routing"
excerpt: "A switch does three things — learn, forward, flood — and everything else in Layer 2 is a refinement of those. VLANs then cut one switch into several that cannot reach each other, which immediately creates the problem of getting between them again. Here is how a MAC table really behaves, why an access port can still carry a tag, and the three ways to route between VLANs with the trade-off that decides which you use."
date: "2026-09-17"
tags: ["Switching", "VLAN", "MAC Address Table", "Inter-VLAN Routing", "SVI", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 1.13 *Describe switching concepts: MAC learning and aging, frame switching, frame flooding, MAC address table*, and 2.1 *Configure and verify VLANs (normal range) spanning multiple switches: access ports (data and voice), default VLAN, InterVLAN connectivity*.

## Cheat sheet

| | |
|---|---|
| **Learns from** | The **source** MAC of every frame it receives |
| **Forwards on** | The **destination** MAC |
| **Unknown destination** | **Flood** out every port in the VLAN except the one it arrived on |
| **Broadcast / multicast** | Flooded the same way — a VLAN **is** a broadcast domain |
| **MAC aging** | **300 seconds** default. Reset every time that MAC is seen again |
| **Table size** | Thousands of entries. Fill it and the switch floods everything |
| **VLAN range** | Normal **1–1005**, extended **1006–4094** |
| **Default VLAN** | **VLAN 1** — carries CDP, VTP, DTP, PAgP. Cannot be deleted |
| **Access port** | One data VLAN — **plus** a tagged voice VLAN, if configured |
| **Inter-VLAN** | Router-on-a-stick · **SVI** · routed port |

**The sentence that explains most Layer 2 behaviour.** A switch never learns where a destination *is* — it only learns where sources *were*. Everything it does not have a record of, it floods, and that single rule accounts for unknown-unicast flooding, the effect of a topology change, and why MAC flooding is an attack at all.

---

## Learn, forward, flood

<div class="walk">
<div class="walk-head">Two hosts, one switch, and an empty table <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="swk" id="sk1" checked><label for="sk1"><span class="step-n">1</span>Empty</label>
  <input type="radio" name="swk" id="sk2"><label for="sk2"><span class="step-n">2</span>Learn + flood</label>
  <input type="radio" name="swk" id="sk3"><label for="sk3"><span class="step-n">3</span>The reply</label>
  <input type="radio" name="swk" id="sk4"><label for="sk4"><span class="step-n">4</span>Unicast</label>
  <input type="radio" name="swk" id="sk5"><label for="sk5"><span class="step-n">5</span>Aging</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv1" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A switch with an empty MAC address table">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="n" x="30" y="70" width="70" height="30" rx="3"/><text class="nt" x="65" y="90" text-anchor="middle">A</text>
  <rect class="n" x="270" y="66" width="70" height="38" rx="3"/><text class="nt" x="305" y="90" text-anchor="middle">SW</text>
  <rect class="n" x="510" y="70" width="70" height="30" rx="3"/><text class="nt" x="545" y="90" text-anchor="middle">B</text>
  <line class="l" x1="100" y1="85" x2="270" y2="85"/>
  <line class="l" x1="340" y1="85" x2="510" y2="85"/>
  <text class="s" x="185" y="76" text-anchor="middle">Gi1/0/1</text>
  <text class="s" x="425" y="76" text-anchor="middle">Gi1/0/2</text>
  <rect x="180" y="126" width="280" height="32" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="320" y="146" text-anchor="middle">MAC table: (empty)</text>
  <text class="k" x="320" y="180" text-anchor="middle">A switch boots knowing nothing. Every table starts here.</text>
</svg>
<p class="walk-say"><span class="walk-title">Nothing is known</span>
A switch has no configuration that says which device is on which port and no way to discover it in advance. The table is built entirely from traffic it happens to see.</p>
</div>
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The switch learns the source MAC and floods the frame because the destination is unknown">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .l{stroke:#8A8A93;stroke-width:1.5}.sv2 .f{stroke:#F2994A;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="70" width="70" height="30" rx="3"/><text class="nt" x="65" y="90" text-anchor="middle">A</text>
  <rect class="n" x="270" y="66" width="70" height="38" rx="3"/><text class="nt" x="305" y="90" text-anchor="middle">SW</text>
  <rect class="n" x="510" y="40" width="70" height="30" rx="3"/><text class="nt" x="545" y="60" text-anchor="middle">B</text>
  <rect class="n" x="510" y="104" width="70" height="30" rx="3" opacity=".45"/><text class="nt" x="545" y="124" text-anchor="middle">C</text>
  <line class="l" x1="100" y1="85" x2="270" y2="85"/>
  <path class="f" d="M 340 78 L 510 55"/>
  <path class="f" d="M 340 94 L 510 119"/>
  <circle r="4.5" fill="#F2994A"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 100 85 L 270 85"/></circle>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.7s" begin="0.6s" repeatCount="indefinite" path="M 340 78 L 510 55"/></circle>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.7s" begin="0.6s" repeatCount="indefinite" path="M 340 94 L 510 119"/></circle>
  <rect x="150" y="146" width="340" height="32" fill="#fff" stroke="#1f9d6b"/>
  <text class="m" x="320" y="166" text-anchor="middle" fill="#0f6b47">aaaa.aaaa.aaaa  →  Gi1/0/1     learned from the SOURCE</text>
  <text class="k" x="320" y="196" text-anchor="middle" fill="#B26014">Destination unknown → flooded everywhere except the port it came in on.</text>
</svg>
<p class="walk-say"><span class="walk-title">One frame does two different jobs</span>
The switch reads the <b>source</b> MAC and records it against the arrival port — that is learning, and it happens on every frame regardless of anything else. Then it looks up the <b>destination</b>, finds nothing, and <b>floods</b>.
<br><br>Host C receives a frame it did not want and discards it in its NIC. That is normal and it is the price of a switch that configures itself. It is also exactly what an attacker wants, which is why filling the table is an attack.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The reply teaches the switch the second address and is forwarded to a single port">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .g{stroke:#1f9d6b;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="70" width="70" height="30" rx="3"/><text class="nt" x="65" y="90" text-anchor="middle">A</text>
  <rect class="n" x="270" y="66" width="70" height="38" rx="3"/><text class="nt" x="305" y="90" text-anchor="middle">SW</text>
  <rect class="n" x="510" y="70" width="70" height="30" rx="3"/><text class="nt" x="545" y="90" text-anchor="middle">B</text>
  <path class="g" d="M 510 85 L 340 85"/>
  <path class="g" d="M 270 85 L 100 85"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 510 85 L 100 85"/></circle>
  <rect x="150" y="130" width="340" height="50" fill="#fff" stroke="#1f9d6b"/>
  <text class="m" x="320" y="150" text-anchor="middle">aaaa.aaaa.aaaa  →  Gi1/0/1</text>
  <text class="m" x="320" y="170" text-anchor="middle" fill="#0f6b47">bbbb.bbbb.bbbb  →  Gi1/0/2    just learned</text>
  <text class="k" x="320" y="42" text-anchor="middle" fill="#0f6b47">Destination A is now known — so this frame is not flooded.</text>
</svg>
<p class="walk-say"><span class="walk-title">The reply completes the picture</span>
B's reply teaches the switch where B is, and because A was already learned, the reply is <b>forwarded to one port only</b>. Host C sees nothing.
<br><br>Note the asymmetry: the very first frame of any conversation is usually flooded, and every frame after it is not. That is why a network that is flooding constantly is a symptom — it means entries are being lost as fast as they are learned.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="With both addresses learned frames are switched directly between two ports">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .g{stroke:#1f9d6b;stroke-width:3;fill:none}</style>
  <rect class="n" x="30" y="66" width="70" height="30" rx="3"/><text class="nt" x="65" y="86" text-anchor="middle">A</text>
  <rect class="n" x="270" y="62" width="70" height="38" rx="3"/><text class="nt" x="305" y="86" text-anchor="middle">SW</text>
  <rect class="n" x="510" y="66" width="70" height="30" rx="3"/><text class="nt" x="545" y="86" text-anchor="middle">B</text>
  <rect class="n" x="510" y="110" width="70" height="30" rx="3" opacity=".3"/><text class="nt" x="545" y="130" text-anchor="middle">C</text>
  <path class="g" d="M 100 81 L 510 81"/>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 100 81 L 510 81"/></circle>
  <circle r="4.5" fill="#1f9d6b"><animateMotion dur="1.5s" begin="0.5s" repeatCount="indefinite" path="M 510 81 L 100 81"/></circle>
  <text class="s" x="545" y="158" text-anchor="middle" opacity=".6">C sees nothing at all</text>
  <text class="k" x="320" y="176" text-anchor="middle" fill="#0f6b47">This is the steady state, and it is what makes a switch a switch rather than a hub.</text>
</svg>
<p class="walk-say"><span class="walk-title">Switched, not flooded</span>
Both directions now go port to port. The bandwidth between A and B is not shared with C, and C's NIC is not interrupted. Every port is its own collision domain.
<br><br>What has <b>not</b> changed is the broadcast domain — a broadcast from A still reaches B and C, because they are all in the same VLAN. Separating that is the next section.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An entry ages out after five minutes of silence and the next frame to that address is flooded again">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="22">THE AGING TIMER — 300 SECONDS, RESET BY EVERY FRAME</text>
  <rect x="14" y="34" width="612" height="24" fill="rgba(31,157,107,.14)" stroke="#1f9d6b"/>
  <text class="m" x="26" y="51" fill="#0f6b47">bbbb.bbbb.bbbb → Gi1/0/2     seen 4 seconds ago — timer reset to 300</text>
  <rect x="14" y="66" width="612" height="24" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="26" y="83">cccc.cccc.cccc → Gi1/0/3     silent for 280 s — 20 s to live</text>
  <rect x="14" y="98" width="612" height="24" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="m" x="26" y="115" fill="#B80027">dddd.dddd.dddd → (removed)   silent for 300 s — gone</text>
  <text class="k" x="14" y="150">A silent device disappears from the table, and the next frame sent to it is flooded.</text>
  <text class="s" x="14" y="174">That is normal. A printer nobody has used since lunchtime will not be in the table, and the</text>
  <text class="s" x="14" y="190">first packet to it floods to every port in the VLAN before the reply teaches the switch again.</text>
</svg>
<p class="walk-say"><span class="walk-title">Aging, and why unicast floods happen in healthy networks</span>
Entries expire after <b>300 seconds</b> of silence by default. So a device that talks rarely is regularly forgotten, and the first frame to it after that is flooded.
<br><br>This matters when it interacts with something else. A spanning tree <b>topology change</b> shortens the aging timer to the forward delay — 15 seconds — so the table empties aggressively and the switch floods far more. That is why a flapping access port without PortFast produces "unexplained slowness": each flap is a topology change, and each topology change causes a burst of flooding across the whole VLAN.</p>
</div>
</div>
</div>

---

## What a VLAN actually is

A VLAN turns one physical switch into several logical ones. Each has **its own MAC address table** and its own broadcast domain, and a frame in one can never reach a port in another — not because it is filtered, but because the lookup happens in a different table.

<figure class="fig">
<svg class="sv6" viewBox="0 0 640 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One physical switch divided into two VLANs each with its own MAC table and broadcast domain">
  <style>.sv6 .n{fill:#17171A}.sv6 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv6 .v10{fill:rgba(75,123,236,.08);stroke:#4b7bec}.sv6 .v20{fill:rgba(31,157,107,.08);stroke:#1f9d6b}
  </style>
  <rect x="180" y="26" width="280" height="150" fill="#F1EEE9" stroke="#8A8A93"/>
  <text class="s" x="320" y="46" text-anchor="middle">one physical switch</text>
  <rect class="v10" x="196" y="56" width="248" height="52"/>
  <text class="k" x="208" y="76" fill="#2b5ab8">VLAN 10</text>
  <text class="m" x="208" y="96">its own MAC table · its own broadcast domain</text>
  <rect class="v20" x="196" y="116" width="248" height="52"/>
  <text class="k" x="208" y="136" fill="#0f6b47">VLAN 20</text>
  <text class="m" x="208" y="156">its own MAC table · its own broadcast domain</text>
  <rect class="n" x="30" y="66" width="76" height="26" rx="3"/><text class="nt" x="68" y="84" text-anchor="middle">PC 1</text>
  <rect class="n" x="30" y="126" width="76" height="26" rx="3"/><text class="nt" x="68" y="144" text-anchor="middle">PC 2</text>
  <rect class="n" x="530" y="66" width="76" height="26" rx="3"/><text class="nt" x="568" y="84" text-anchor="middle">PC 3</text>
  <rect class="n" x="530" y="126" width="76" height="26" rx="3"/><text class="nt" x="568" y="144" text-anchor="middle">PC 4</text>
  <line x1="106" y1="79" x2="196" y2="79" stroke="#4b7bec" stroke-width="2.5"/>
  <line x1="106" y1="139" x2="196" y2="139" stroke="#1f9d6b" stroke-width="2.5"/>
  <line x1="444" y1="79" x2="530" y2="79" stroke="#4b7bec" stroke-width="2.5"/>
  <line x1="444" y1="139" x2="530" y2="139" stroke="#1f9d6b" stroke-width="2.5"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 106 79 L 530 79"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.6s" repeatCount="indefinite" path="M 106 139 L 530 139"/></circle>
  <path d="M 320 108 L 320 116" stroke="#D3002D" stroke-width="2.5" stroke-dasharray="3 3"/>
  <line x1="312" y1="104" x2="328" y2="120" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="328" y1="104" x2="312" y2="120" stroke="#D3002D" stroke-width="2.5"/>
  <text class="k" x="320" y="202" text-anchor="middle">PC 1 cannot reach PC 2, and they are eight centimetres apart.</text>
  <text class="s" x="320" y="224" text-anchor="middle">Nothing is filtering. The lookup for PC 2's MAC simply does not happen in VLAN 10's table.</text>
</svg>
<figcaption><b>Figure 1.</b> Separation by table, not by rule — which is why it fails closed, and why getting between the two needs a device that operates at Layer 3.</figcaption>
</figure>

<div class="note">
<b>VLAN 1, and why to move off it</b>
VLAN 1 is the default for every port, cannot be deleted, and carries the switch's own control traffic — CDP, VTP, DTP, PAgP. Two habits follow. <b>Do not put users in VLAN 1</b>, so that a port nobody has configured lands somewhere harmless rather than alongside your management traffic. And <b>set the native VLAN on trunks to an unused VLAN</b>, so that untagged frames arriving on a trunk do not land in the same VLAN as control protocols.
</div>

### An access port that carries a tag

<div class="cmd">
<div class="cmd-line">interface GigabitEthernet1/0/5
 <span class="t">switchport mode access</span>
 <span class="t">switchport access vlan</span> <span class="opt">10</span>
 <span class="t">switchport voice vlan</span> <span class="opt">110</span>
 <span class="t">switchport nonegotiate</span>
 <span class="t">spanning-tree portfast</span>
 <span class="t">spanning-tree bpduguard enable</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>switchport mode access</dt><dd>Hard-codes the port. Without it the port may negotiate a trunk with whatever is plugged in — which is the switch-spoofing problem covered in the <a href="/blog/dot1q-trunking-native-vlan-and-dtp-explained">trunking article</a>.</dd></div>
<div><dt>switchport access vlan 10</dt><dd>The data VLAN, carried <b>untagged</b>. If VLAN 10 does not exist in the VLAN database the port goes <b>inactive</b> — it stays up but passes nothing. Create the VLAN first.</dd></div>
<div class="is-key"><dt>switchport voice vlan 110</dt><dd>Here is the subtlety worth knowing: <b>an access port with a voice VLAN is not purely untagged.</b> The phone is told via CDP or LLDP-MED to tag its own traffic with VLAN 110, while the PC hanging off the phone stays untagged in VLAN 10. So one "access" port carries one untagged VLAN and one tagged one — a trunk in everything but name, deliberately limited to two VLANs.
<br><br>It also means port security needs <code>maximum 2</code> or more on such a port, because the phone and the PC are two MACs.</dd></div>
<div><dt>switchport nonegotiate</dt><dd>Stops DTP frames entirely. On an access port they serve no purpose and are a liability.</dd></div>
<div><dt>portfast + bpduguard</dt><dd>Forward immediately, and err-disable if a BPDU ever arrives — the pair that makes an access port safe. Covered in the <a href="/blog/spanning-tree-explained-root-election-port-roles-rstp">spanning tree article</a>.</dd></div>
</dl>
</div>

---

## Getting between VLANs — three ways

<div class="cmd">
<div class="cmd-line"><span class="opt">! 1 · ROUTER ON A STICK — a router, one trunk, a subinterface per VLAN</span>
interface GigabitEthernet0/0.10
 <span class="t">encapsulation dot1Q</span> <span class="opt">10</span>
 ip address 10.1.10.1 255.255.255.0
interface GigabitEthernet0/0.99
 <span class="t">encapsulation dot1Q</span> <span class="opt">99 native</span>
 ip address 10.1.99.1 255.255.255.0</div>
<dl class="cmd-parts">
<div><dt>encapsulation dot1Q 10</dt><dd>Tells the subinterface which VLAN tag to add on the way out and match on the way in. <b>The subinterface number does not have to match the VLAN</b> — but make it match anyway, because the first person to debug this at 3am will assume it does.</dd></div>
<div class="is-key"><dt>99 <b>native</b></dt><dd>The native VLAN arrives <b>untagged</b>, so its subinterface must be told to expect that. Omit <code>native</code> and traffic in the native VLAN is silently dropped — one VLAN out of several stops working, which sends people looking at the wrong things entirely.</dd></div>
<div><dt><span class="opt">when to use it</span></dt><dd>Small sites, or where the only Layer 3 device is a router. <b>All inter-VLAN traffic crosses one physical link twice</b> — in and out — so that link is the ceiling on everything. It is the design you outgrow.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! 2 · SVI — a Layer 3 switch routing in hardware</span>
<span class="t">ip routing</span>
!
<span class="t">interface Vlan10</span>
 ip address 10.1.10.1 255.255.255.0
<span class="t">interface Vlan20</span>
 ip address 10.1.20.1 255.255.255.0</div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip routing</dt><dd><b>Off by default on a Layer 3 switch.</b> Without it the SVIs come up, accept addresses and route nothing — so every VLAN works internally and nothing crosses between them. This is the single most common inter-VLAN fault and it is one line.</dd></div>
<div class="is-key"><dt>interface Vlan10</dt><dd>A virtual interface that is the gateway for that VLAN. <b>It only comes up when three things are true</b>: the VLAN exists in the database, at least one access port in it is up <em>or</em> a trunk carrying it is up, and the SVI is not shut. An SVI stuck <code>down/down</code> almost always means no active port in the VLAN — plugging one host in brings the gateway up.</dd></div>
<div><dt><span class="opt">when to use it</span></dt><dd>Almost always, in a campus. Routing happens in ASICs at line rate, there is no single link to saturate, and the same box does Layer 2 and Layer 3. This is the default answer.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! 3 · ROUTED PORT — a switch port that stops being a switch port</span>
interface GigabitEthernet1/0/24
 <span class="t">no switchport</span>
 ip address 10.0.0.1 255.255.255.252</div>
<dl class="cmd-parts">
<div><dt>no switchport</dt><dd>Turns the port into a router interface. No VLAN, no spanning tree, no MAC learning — just a Layer 3 link. <b>It also removes any existing IP configuration</b>, in the same way that <code>vrf forwarding</code> does, so apply it first.</dd></div>
<div><dt><span class="opt">when to use it</span></dt><dd>Uplinks between Layer 3 switches, where you want routing rather than a trunk. It removes that link from spanning tree entirely, which is usually the point — a routed campus core converges on IGP timers rather than STP ones.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
The inter-VLAN fault that wastes the most time is not a routing problem at all — it is an <b>SVI that is <code>down/down</code> because no port in that VLAN is up</b>. You build a new VLAN, create the SVI, give it an address, and nothing works. Everything in the configuration is correct. The VLAN simply has no active member yet, so the switch keeps the interface down, and the gateway does not exist.
<br><br>Plug one device in, or trunk the VLAN to somewhere that has one, and it comes up. The tell is <code>show ip interface brief | include Vlan</code> showing <code>down/down</code> on a freshly built VLAN while every other SVI is up.
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — the three commands, and what each one settles</div>
<pre><span class="p">SW1#</span> <span class="c">show mac address-table</span>
          Mac Address Table
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
<span class="y">10</span>      0050.56a1.b2c3    DYNAMIC     Gi1/0/5
<span class="y">10</span>      0050.56d4.e5f6    DYNAMIC     Gi1/0/6
<span class="y">110</span>     0021.a0bb.cc11    DYNAMIC     Gi1/0/5        <span class="o">&lt;- the phone, tagged voice VLAN</span>
<span class="y">20</span>      000c.2911.2233    DYNAMIC     Gi1/0/24       <span class="o">&lt;- learned over the trunk</span>

<span class="o">! One port, two VLANs: Gi1/0/5 has a PC in 10 and a phone in 110.</span>
<span class="o">! That is a voice VLAN doing exactly what it should.</span>

<span class="p">SW1#</span> <span class="c">show vlan brief</span>
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi1/0/7, Gi1/0/8
10   DATA                             active    Gi1/0/5, Gi1/0/6
20   SERVERS                          <span class="r">active</span>
110  VOICE                            active    Gi1/0/5
999  NATIVE-UNUSED                    active

<span class="o">! VLAN 20 exists but has NO access ports listed. If its SVI is down/down,</span>
<span class="o">! this is why — there is no active member to bring it up.</span>

<span class="p">SW1#</span> <span class="c">show interfaces status</span>
Port      Name       Status       Vlan       Duplex  Speed Type
Gi1/0/5   pc+phone   connected    <span class="g">10</span>         a-full a-1000 10/100/1000BaseTX
Gi1/0/9              <span class="r">connected    inactive</span>   a-full a-1000 10/100/1000BaseTX
Gi1/0/24  uplink     connected    <span class="y">trunk</span>      a-full a-1000 10/100/1000BaseTX

<span class="o">! "inactive" in the Vlan column means the port is assigned to a VLAN that</span>
<span class="o">! does NOT exist in the database. The link is up and nothing passes.</span>

<span class="p">SW1#</span> <span class="c">show ip interface brief | include Vlan</span>
Vlan10                 10.1.10.1       YES manual up                    up
Vlan20                 10.1.20.1       YES manual <span class="r">down</span>                  <span class="r">down</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two words are worth memorising from this output.</b> <code>inactive</code> in <code>show interfaces status</code> means the port's VLAN does not exist — the commonest cause of "the port is up and nothing works". And an SVI showing <code>down/down</code> while its configuration is perfect means no active port in that VLAN, not a routing problem.</p>

---

## What goes wrong

**A port is up and passes nothing, showing `inactive`.** The access VLAN does not exist. Create it.

**An SVI is `down/down` with a correct address.** No active port in that VLAN. Plug something in or trunk it somewhere.

**VLANs work internally but nothing routes between them.** `ip routing` is off on the Layer 3 switch.

**One VLAN fails across a router-on-a-stick, the others work.** The native VLAN's subinterface is missing `native` on its `encapsulation` line.

**Constant unicast flooding.** Entries are aging or being flushed faster than they are learned — usually spanning tree topology changes from a flapping access port without PortFast.

**A phone works and the PC behind it does not.** The data VLAN is wrong, or port security is at `maximum 1` and the phone claimed the only slot.

**A VLAN works on one switch and not the other.** It is not allowed on the trunk between them, or it does not exist on the far switch.

---

<div class="lab">
<div class="lab-head">Lab — watch a MAC table live, then route between VLANs three ways</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
See learning, flooding and aging happen in real time rather than reading about them. Build three VLANs across two switches and prove hosts in different VLANs cannot reach each other even on the same switch. Then route between them with router-on-a-stick and with SVIs, and meet the four faults that make a correct-looking VLAN configuration pass no traffic.</div>

**Topology.** Two switches joined by a trunk, a Layer 3 switch or router for inter-VLAN routing, four hosts, and a capture machine on a SPAN port.

<p class="lab-step"><span class="n">1</span>Watch the table build itself</p>

```cisco
SW1# clear mac address-table dynamic
SW1# show mac address-table
```

Now ping from host A to host B, and immediately run `show mac address-table` again.

<div class="lab-watch"><b>Things to notice</b>
Both MACs appear — and they appeared from <b>different frames</b>. A's was learned from the ping request, B's from the reply. Now capture on host C's port and repeat after clearing: you will see the <b>first</b> frame arrive at C and nothing after it, because by the second frame the switch knew where B was.
<br><br>That single observation is the whole of learn-forward-flood, and it takes about a minute.</div>

<p class="lab-step"><span class="n">2</span>Watch an entry age out</p>

Leave a host idle and poll the table:

```cisco
SW1# show mac address-table address <host-mac>
SW1# show mac address-table aging-time
```

<div class="lab-watch"><b>Things to notice</b>
It disappears after roughly 300 seconds of silence — and returns the moment the host sends anything. Set <code>mac address-table aging-time 30</code> and watch the cycle speed up.
<br><br>Then flap an access port that does <b>not</b> have PortFast and watch the table get flushed far more aggressively, because the topology change shortens aging to the forward delay. That is the link between a flapping port and network-wide flooding, demonstrated.</div>

<p class="lab-step"><span class="n">3</span>Build VLANs and prove the isolation</p>

```cisco
vlan 10
 name DATA
vlan 20
 name SERVERS
!
interface GigabitEthernet1/0/5
 switchport mode access
 switchport access vlan 10
interface GigabitEthernet1/0/6
 switchport mode access
 switchport access vlan 20
```

Give both hosts addresses in the **same** subnet, then ping between them.

<div class="lab-watch"><b>Things to notice</b>
It fails — and it fails even though the two hosts are in the same IP subnet on the same switch, which is the clearest possible demonstration that VLANs are a Layer 2 boundary. Check <code>show mac address-table</code>: both MACs are there, in different VLANs, and the switch will not look across.
<br><br>Now capture a broadcast from host A on host B's port and see nothing at all.</div>

<p class="lab-step"><span class="n">4</span>Produce the two silent failures</p>

1. Assign a port to `vlan 99` without creating VLAN 99.
2. Create VLAN 30 and an SVI for it with no ports in it.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The VLAN was created automatically</b> — some platforms auto-create on assignment. Check <code>show vlan brief</code>; if it appears, delete it and watch the port go <code>inactive</code>.</li>
<li><b>The SVI comes up anyway</b> — a trunk carrying VLAN 30 counts as an active member. Remove it from the trunk's allowed list.</li>
<li><b>You cannot tell which fault you have</b> — <code>show interfaces status</code> says <code>inactive</code> for the first, <code>show ip interface brief</code> says <code>down/down</code> for the second.</li>
</ul>
Both look like cabling faults and neither is. Learning the two words that distinguish them is worth more than any amount of re-checking configuration.</div>

<p class="lab-step"><span class="n">5</span>Route with a router on a stick</p>

Trunk to a router and build subinterfaces for VLANs 10, 20 and the native VLAN 999 — deliberately **omitting** `native` on the last one at first.

<div class="lab-watch"><b>Things to notice</b>
VLANs 10 and 20 route fine; the native VLAN does not, and nothing in any show command obviously says why. Add <code>native</code> to its <code>encapsulation</code> line and it starts working.
<br><br>Then measure the ceiling: run traffic between VLAN 10 and VLAN 20 and watch the trunk interface counters. <b>Every byte crosses that one link twice.</b> That number is the argument for SVIs, and now you have it for your own hardware.</div>

<p class="lab-step"><span class="n">6</span>Route with SVIs, and forget <code>ip routing</code></p>

On the Layer 3 switch, build `interface Vlan10` and `interface Vlan20` with addresses — but do **not** enable `ip routing` yet.

<div class="lab-watch"><b>Things to notice</b>
Hosts can ping their own gateway and nothing else. Both SVIs are <code>up/up</code>, both addresses are right, and no traffic crosses. Add <code>ip routing</code> and it works instantly.
<br><br>This is worth producing deliberately because everything about the failure points away from the cause — the interfaces are up, the addresses are correct, and the missing piece is a global command with no obvious relationship to the symptom.</div>

<p class="lab-step"><span class="n">7</span>Add a voice VLAN and count the MACs</p>

```cisco
interface GigabitEthernet1/0/5
 switchport access vlan 10
 switchport voice vlan 110
```

```cisco
SW1# show mac address-table interface Gi1/0/5
```

<div class="lab-watch"><b>Things to notice</b>
<b>One port, two VLANs, two MAC addresses.</b> Capture on the port and confirm the phone's traffic is <em>tagged</em> with VLAN 110 while the PC's is untagged — an "access" port carrying a tag.
<br><br>Then add <code>switchport port-security</code> with its default maximum of 1 and watch the port err-disable, because two MACs are legitimately present. That is the connection between this article and the <a href="/blog/layer-2-security-port-security-dhcp-snooping-and-dai">Layer 2 security</a> one, and it is a real outage people cause on day one of a port-security rollout.</div>

<div class="lab-earned"><b>What you earned</b>
You have watched a MAC table learn, flood and age in real time, so unknown-unicast flooding is a behaviour you have seen rather than a phrase. You can explain why a flapping port without PortFast makes an entire VLAN slow. You know the two words — <code>inactive</code> and <code>down/down</code> — that distinguish the two silent VLAN failures that look like cabling problems. You have measured router-on-a-stick's ceiling on your own hardware. And you know that an access port with a voice VLAN carries a tag, which is both a nice piece of trivia and the reason a default port-security setting takes phones off the network.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Which MAC address does a switch learn from, and which does it forward on?</p>
<label class="qz-opt"><input type="radio" name="swq1"><span>Learns from the destination, forwards on the source</span><em class="qz-fb qz-bad">Reversed. The destination is what it looks up; it has no way to learn from an address it is searching for.</em></label>
<label class="qz-opt"><input type="radio" name="swq1"><span>Learns from the source, forwards on the destination</span><em class="qz-fb qz-good">Correct — and it means a switch only ever knows where senders <em>were</em>, never where a destination is. That is why anything unknown gets flooded.</em></label>
<label class="qz-opt"><input type="radio" name="swq1"><span>Both from the destination</span><em class="qz-fb qz-bad">The source is the only address that tells it anything about the arrival port.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A port is <code>connected</code> but <code>show interfaces status</code> shows <code>inactive</code> in the VLAN column. What is wrong?</p>
<label class="qz-opt"><input type="radio" name="swq2"><span>The access VLAN does not exist in the VLAN database</span><em class="qz-fb qz-good">Correct. The link is up, the port is configured, and nothing passes until the VLAN is created.</em></label>
<label class="qz-opt"><input type="radio" name="swq2"><span>Spanning tree is blocking it</span><em class="qz-fb qz-bad">That shows as a blocking state in spanning tree output, not as <code>inactive</code>.</em></label>
<label class="qz-opt"><input type="radio" name="swq2"><span>Duplex mismatch</span><em class="qz-fb qz-bad">That produces errors and poor performance, not an inactive VLAN.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A new SVI has a correct IP address but is <code>down/down</code>. Why?</p>
<label class="qz-opt"><input type="radio" name="swq3"><span>No active port in that VLAN — access or trunk</span><em class="qz-fb qz-good">Right. An SVI needs the VLAN to exist and at least one up member. Plug a host in, or carry the VLAN on an up trunk.</em></label>
<label class="qz-opt"><input type="radio" name="swq3"><span><code>ip routing</code> is disabled</span><em class="qz-fb qz-bad">That stops routing between SVIs but does not hold one down.</em></label>
<label class="qz-opt"><input type="radio" name="swq3"><span>The address overlaps another SVI</span><em class="qz-fb qz-bad">That is rejected at configuration time with an error.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>On a router-on-a-stick, one VLAN does not route while the others do. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="swq4"><span>It is the native VLAN and its subinterface is missing the <code>native</code> keyword</span><em class="qz-fb qz-good">Correct — native VLAN traffic arrives untagged, so the subinterface must be told to expect it. Without it, that traffic is silently dropped.</em></label>
<label class="qz-opt"><input type="radio" name="swq4"><span>The subinterface number does not match the VLAN</span><em class="qz-fb qz-bad">It does not have to match — only the <code>encapsulation dot1Q</code> number matters.</em></label>
<label class="qz-opt"><input type="radio" name="swq4"><span>The trunk is not allowing that VLAN</span><em class="qz-fb qz-bad">Possible, and worth checking — but the native-VLAN keyword is the classic version of this fault.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does an access port with a voice VLAN need port security <code>maximum 2</code> or more?</p>
<label class="qz-opt"><input type="radio" name="swq5"><span>Because the phone and the PC behind it are two separate MAC addresses</span><em class="qz-fb qz-good">Correct — and the phone's traffic is tagged in the voice VLAN while the PC's is untagged in the data VLAN. The default maximum of 1 err-disables the port.</em></label>
<label class="qz-opt"><input type="radio" name="swq5"><span>Because voice VLANs count double</span><em class="qz-fb qz-bad">There is no such rule. It is simply two devices.</em></label>
<label class="qz-opt"><input type="radio" name="swq5"><span>It does not — one is enough</span><em class="qz-fb qz-bad">One is what causes the outage on the first day of a port-security rollout.</em></label>
</div>

---

## References

- **IEEE 802.1D** — MAC bridging: learning, forwarding and aging.
- **IEEE 802.1Q** — VLANs and the tag format.
- Cisco — [Configuring VLANs](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/vlan/b_173_vlan_9300_cg/configuring_vlans.html)
- Cisco — [Configuring InterVLAN Routing](https://www.cisco.com/c/en/us/support/docs/lan-switching/inter-vlan-routing/41860-howto-L3-intervlanrouting.html)
- Cisco — [Configuring Voice VLANs](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/vlan/b_173_vlan_9300_cg/configuring_voice_vlans.html)

---

*Related: [802.1Q trunking and DTP](/blog/dot1q-trunking-native-vlan-and-dtp-explained) · [Layer 2 security](/blog/layer-2-security-port-security-dhcp-snooping-and-dai) · [Spanning tree](/blog/spanning-tree-explained-root-election-port-roles-rstp).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
