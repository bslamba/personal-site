---
title: "MST: One Spanning Tree for Many VLANs, and the Digest That Decides Everything"
excerpt: "PVST+ runs a complete spanning tree per VLAN. At four hundred VLANs that is four hundred state machines doing nearly identical arithmetic to produce two distinct answers. MST asks the obvious question — why not run two? The mechanism is simple and the failure mode is brutal: three configuration items must match byte for byte across every switch, and if one character of the region name differs, the switch silently stops being part of your region."
date: "2026-09-21"
tags: ["MST", "802.1s", "Spanning Tree", "STP", "Switching", "ENCOR", "CCNP"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.1.c *Configure and verify common Spanning Tree Protocols (RSTP, MST) and Spanning Tree enhancements such as root guard and BPDU guard.* This covers MST; for root election, port roles, RSTP and the guards see [Spanning tree: root election, port roles and RSTP](/blog/spanning-tree-explained-root-election-port-roles-rstp).

## Cheat sheet

| | |
|---|---|
| **Standard** | IEEE **802.1s**, now folded into 802.1Q |
| **A region is** | **name** + **revision number** + **VLAN-to-instance mapping**. All three, exactly |
| **Instance 0** | The **IST** — Internal Spanning Tree. Always exists, carries all unmapped VLANs |
| **Instances** | Up to **65 including instance 0** on modern Catalyst; older platforms 16 (IST + 15) |
| **BPDUs on the wire** | **Only the IST sends BPDUs.** Other instances ride inside as 16-byte **M-records** |
| **Region name** | 32 bytes, **case sensitive**, whitespace counts |
| **Revision** | 2 bytes, 0–65535. Just a number — but it must match |
| **Digest** | MD5 of the VLAN-to-instance table, carried in every BPDU |
| **Default digest** | `0xAC36177F50283CD4B83821D8AB26DE62` — **all 4094 VLANs in instance 0** |
| **Outside the region** | The whole region looks like **one bridge** running one spanning tree |

**What to hold onto.** MST separates *how many VLANs you have* from *how many topologies you need*. Those are different numbers, and PVST+ pretends they are the same one.

---

## The problem with one tree per VLAN

Rapid PVST+ is excellent and it is what most networks run. It also runs an independent spanning tree instance for **every VLAN**. Each one elects a root, calculates port roles, maintains timers and sends its own BPDU out of every trunk, every two seconds.

With 400 VLANs on a trunk, that is 400 BPDUs every two seconds on that one link, and 400 state machines on the switch — to produce, in almost every real design, **two** distinct topologies: odd VLANs up the left uplink, even VLANs up the right.

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PVST plus runs one spanning tree instance per VLAN while MST maps many VLANs onto two instances">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.06em}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .bx{fill:#F1EEE9;stroke:#B5B5BC}.sv1 .i1{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv1 .i2{fill:rgba(31,157,107,.16);stroke:#1f9d6b}
  </style>
  <text class="hdr" x="14" y="16" fill="#D3002D">RAPID PVST+ — ONE INSTANCE PER VLAN</text>
  <rect class="bx" x="14" y="28" width="40" height="22"/><text class="s" x="34" y="43" text-anchor="middle">v10</text>
  <rect class="bx" x="58" y="28" width="40" height="22"/><text class="s" x="78" y="43" text-anchor="middle">v20</text>
  <rect class="bx" x="102" y="28" width="40" height="22"/><text class="s" x="122" y="43" text-anchor="middle">v30</text>
  <rect class="bx" x="146" y="28" width="40" height="22"/><text class="s" x="166" y="43" text-anchor="middle">v40</text>
  <rect class="bx" x="190" y="28" width="40" height="22"/><text class="s" x="210" y="43" text-anchor="middle">v50</text>
  <rect class="bx" x="234" y="28" width="52" height="22"/><text class="s" x="260" y="43" text-anchor="middle">… 400</text>
  <path d="M 150 54 L 150 74" stroke="#D3002D" stroke-width="1.5" fill="none" marker-end="url(#m1)"/>
  <defs><marker id="m1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#D3002D"/></marker></defs>
  <rect x="14" y="80" width="272" height="30" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="150" y="100" text-anchor="middle" fill="#B80027">400 instances · 400 BPDUs every 2 s per trunk</text>
  <text class="s" x="150" y="128" text-anchor="middle">Every VLAN elects its own root, keeps its own timers,</text>
  <text class="s" x="150" y="144" text-anchor="middle">and recalculates on every topology change.</text>
  <text class="s" x="150" y="160" text-anchor="middle" fill="#D3002D">All to produce two different answers.</text>
  <line x1="320" y1="14" x2="320" y2="176" stroke="#ECECEF"/>
  <text class="hdr" x="356" y="16" fill="#0f6b47">MST — MANY VLANS, TWO TOPOLOGIES</text>
  <rect class="bx" x="356" y="28" width="40" height="22"/><text class="s" x="376" y="43" text-anchor="middle">v10</text>
  <rect class="bx" x="400" y="28" width="40" height="22"/><text class="s" x="420" y="43" text-anchor="middle">v30</text>
  <rect class="bx" x="444" y="28" width="52" height="22"/><text class="s" x="470" y="43" text-anchor="middle">…odd</text>
  <rect class="bx" x="508" y="28" width="40" height="22"/><text class="s" x="528" y="43" text-anchor="middle">v20</text>
  <rect class="bx" x="552" y="28" width="40" height="22"/><text class="s" x="572" y="43" text-anchor="middle">v40</text>
  <rect class="bx" x="596" y="28" width="30" height="22"/><text class="s" x="611" y="43" text-anchor="middle">…</text>
  <path d="M 424 54 L 424 74" stroke="#4b7bec" stroke-width="1.5" fill="none" marker-end="url(#m2)"/>
  <path d="M 560 54 L 560 74" stroke="#1f9d6b" stroke-width="1.5" fill="none" marker-end="url(#m3)"/>
  <defs>
    <marker id="m2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#4b7bec"/></marker>
    <marker id="m3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#1f9d6b"/></marker>
  </defs>
  <rect class="i1" x="356" y="80" width="136" height="30"/><text class="k" x="424" y="100" text-anchor="middle" fill="#2b5ab8">MST instance 1</text>
  <rect class="i2" x="500" y="80" width="126" height="30"/><text class="k" x="563" y="100" text-anchor="middle" fill="#0f6b47">MST instance 2</text>
  <text class="s" x="490" y="128" text-anchor="middle">Two instances. Two roots. Two BPDU streams —</text>
  <text class="s" x="490" y="144" text-anchor="middle">and actually only one, because the other rides inside it.</text>
  <text class="s" x="490" y="160" text-anchor="middle" fill="#0f6b47">Add VLAN 401 tomorrow: map it, no new instance.</text>
  <rect x="14" y="192" width="612" height="54" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="k" x="26" y="212" fill="#17171A">The trade</text>
  <text class="s" x="26" y="228">You lose per-VLAN control of the topology — VLANs in the same instance always take the same path, for ever.</text>
  <text class="s" x="26" y="242">In exchange you get a control plane whose size no longer grows with your VLAN count. In a campus that is a good trade.</text>
</svg>
<figcaption><b>Figure 1.</b> MST is not faster than Rapid PVST+ — both are RSTP underneath. It is <em>smaller</em>, and the saving grows with every VLAN you add.</figcaption>
</figure>

---

## The region: three things that must match exactly

Two MST switches only belong to the same region if **all three** of these are identical:

1. The **region name** — 32 characters, case sensitive.
2. The **revision number** — an integer you choose.
3. The **entire VLAN-to-instance mapping table** — all 4094 entries.

Comparing a 4094-entry table in every BPDU would be absurd, so MST hashes it: an **MD5 digest** of the mapping table travels in every BPDU. A switch compares the received digest with its own. Same digest, same region. Different digest — **the port becomes a boundary**, and the neighbour is treated as a foreign, external bridge.

<div class="walk">
<div class="walk-head">Building a region — and the moment it silently fails <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="mstw" id="mw1" checked><label for="mw1"><span class="step-n">1</span>Defaults</label>
  <input type="radio" name="mstw" id="mw2"><label for="mw2"><span class="step-n">2</span>Staged</label>
  <input type="radio" name="mstw" id="mw3"><label for="mw3"><span class="step-n">3</span>Region forms</label>
  <input type="radio" name="mstw" id="mw4"><label for="mw4"><span class="step-n">4</span>Two topologies</label>
  <input type="radio" name="mstw" id="mw5"><label for="mw5"><span class="step-n">5</span>One typo</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="With default MST configuration every VLAN is in instance zero and every switch shares the same default digest">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .l{stroke:#8A8A93;stroke-width:1.5}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}</style>
  <rect class="n" x="60" y="60" width="76" height="34" rx="3"/><text class="nt" x="98" y="82" text-anchor="middle">SW1</text>
  <rect class="n" x="282" y="60" width="76" height="34" rx="3"/><text class="nt" x="320" y="82" text-anchor="middle">SW2</text>
  <rect class="n" x="504" y="60" width="76" height="34" rx="3"/><text class="nt" x="542" y="82" text-anchor="middle">SW3</text>
  <line class="l" x1="136" y1="77" x2="282" y2="77"/>
  <line class="l" x1="358" y1="77" x2="504" y2="77"/>
  <text class="s" x="98" y="112" text-anchor="middle">name: &#8220;&#8221; (empty)</text>
  <text class="s" x="320" y="112" text-anchor="middle">name: &#8220;&#8221; (empty)</text>
  <text class="s" x="542" y="112" text-anchor="middle">name: &#8220;&#8221; (empty)</text>
  <text class="s" x="98" y="126" text-anchor="middle">rev 0 · all VLANs → 0</text>
  <text class="s" x="320" y="126" text-anchor="middle">rev 0 · all VLANs → 0</text>
  <text class="s" x="542" y="126" text-anchor="middle">rev 0 · all VLANs → 0</text>
  <text class="k" x="320" y="34" text-anchor="middle">spanning-tree mode mst — and nothing else</text>
  <text class="m" x="320" y="154" text-anchor="middle">digest 0xAC36177F50283CD4B83821D8AB26DE62</text>
  <text class="s" x="320" y="172" text-anchor="middle">Identical on all three — so they <tspan font-weight="700">are</tspan> one region already. One instance, one topology, every VLAN.</text>
</svg>
<p class="walk-say"><span class="walk-title">Defaults already form a region</span>
Turn on MST and change nothing, and every switch has an empty name, revision 0 and all 4094 VLANs mapped to instance 0. They agree, so they form one region running a single spanning tree for everything — which behaves like plain RSTP with no per-VLAN load sharing at all.
<br><br>Memorise that digest. <b>0xAC36177F…</b> means "nobody has mapped anything here". Seeing it on a switch you thought was configured tells you your mapping never committed.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MST configuration sub-mode stages changes which are not applied until you exit">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#D6D6DC}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;fill:#8A8A93;letter-spacing:.06em}</style>
  <text class="hdr" x="14" y="16">A STAGING AREA, NOT A LIVE CONFIGURATION</text>
  <rect x="14" y="26" width="612" height="104" fill="#0C0C0E"/>
  <text class="m" x="26" y="46" fill="#6FCF97">SW1(config)#</text><text class="m" x="128" y="46">spanning-tree mst configuration</text>
  <text class="m" x="26" y="64" fill="#6FCF97">SW1(config-mst)#</text><text class="m" x="158" y="64">name CAMPUS</text>
  <text class="m" x="26" y="82" fill="#6FCF97">SW1(config-mst)#</text><text class="m" x="158" y="82">revision 3</text>
  <text class="m" x="26" y="100" fill="#6FCF97">SW1(config-mst)#</text><text class="m" x="158" y="100">instance 1 vlan 10,30,50</text>
  <text class="m" x="26" y="118" fill="#6FCF97">SW1(config-mst)#</text><text class="m" x="158" y="118">instance 2 vlan 20,40,60</text>
  <text class="k" x="14" y="152" fill="#B26014">Nothing above has taken effect yet.</text>
  <text class="s" x="14" y="170">&#8220;show pending&#8221; shows what you are about to commit. &#8220;abort&#8221; throws it away. <tspan font-weight="700">&#8220;exit&#8221; applies it all at once</tspan> —</text>
  <text class="s" x="14" y="186">which is exactly what you want, because applying a mapping line by line would reconverge the network on every line.</text>
</svg>
<p class="walk-say"><span class="walk-title">The sub-mode stages everything</span>
<code>spanning-tree mst configuration</code> is unlike almost every other IOS mode: your changes are <b>held</b> until you leave it. Use <code>show pending</code> to review, <code>abort</code> to discard, and <code>exit</code> to commit.
<br><br>This is deliberate and it is a gift. The VLAN-to-instance mapping is the digest, so every intermediate state would be a different region — and each one would tear the network apart and rebuild it. Staging means one change, one reconvergence. <b>It also means <code>exit</code> is a production-affecting keystroke</b>, so run <code>show pending</code> first, every time.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="All three switches now share the same name revision and mapping so the digests match and one region exists">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .l{stroke:#1f9d6b;stroke-width:3}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#0f6b47}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}</style>
  <rect x="34" y="40" width="572" height="80" fill="rgba(31,157,107,.07)" stroke="#1f9d6b" stroke-dasharray="5 4"/>
  <text class="k" x="320" y="32" text-anchor="middle">REGION &#8220;CAMPUS&#8221; · revision 3</text>
  <rect class="n" x="60" y="62" width="76" height="34" rx="3"/><text class="nt" x="98" y="84" text-anchor="middle">SW1</text>
  <rect class="n" x="282" y="62" width="76" height="34" rx="3"/><text class="nt" x="320" y="84" text-anchor="middle">SW2</text>
  <rect class="n" x="504" y="62" width="76" height="34" rx="3"/><text class="nt" x="542" y="84" text-anchor="middle">SW3</text>
  <line class="l" x1="136" y1="79" x2="282" y2="79"/>
  <line class="l" x1="358" y1="79" x2="504" y2="79"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 136 79 L 282 79"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.6s" repeatCount="indefinite" path="M 358 79 L 504 79"/></circle>
  <text class="m" x="320" y="140" text-anchor="middle">digest 0x1F2E…  — identical on all three</text>
  <text class="s" x="320" y="162" text-anchor="middle">Only <tspan font-weight="700">instance 0 (the IST)</tspan> actually sends BPDUs on these links.</text>
  <text class="s" x="320" y="180" text-anchor="middle">Instances 1 and 2 travel inside them as 16-byte M-records — two topologies, one BPDU.</text>
</svg>
<p class="walk-say"><span class="walk-title">One region, one BPDU, many topologies</span>
This is the mechanical saving. Rapid PVST+ would send one BPDU per VLAN per trunk. MST sends <b>one BPDU</b>, and appends a 16-byte M-record for each additional instance. Two instances is one BPDU plus 32 bytes, whether you have 6 VLANs mapped or 600.
<br><br>Because only the IST speaks on the wire, anything that filters or blocks BPDUs affects every instance at once — there is no such thing as losing the topology for one instance only.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Instance 1 is rooted on the left distribution switch and instance 2 on the right so both uplinks forward">
  <style>.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .i1{stroke:#4b7bec;stroke-width:3}.sv5 .i2{stroke:#1f9d6b;stroke-width:3}.sv5 .b1{stroke:#4b7bec;stroke-width:2;stroke-dasharray:5 4}.sv5 .b2{stroke:#1f9d6b;stroke-width:2;stroke-dasharray:5 4}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect class="n" x="110" y="24" width="120" height="32" rx="3" fill="#2b5ab8"/><text class="nt" x="170" y="45" text-anchor="middle">DIST-A</text>
  <rect class="n" x="410" y="24" width="120" height="32" rx="3" fill="#0f6b47"/><text class="nt" x="470" y="45" text-anchor="middle">DIST-B</text>
  <text class="s" x="170" y="70" text-anchor="middle" fill="#2b5ab8">root for instance 1</text>
  <text class="s" x="470" y="70" text-anchor="middle" fill="#0f6b47">root for instance 2</text>
  <rect class="n" x="280" y="146" width="90" height="32" rx="3"/><text class="nt" x="325" y="167" text-anchor="middle">ACCESS</text>
  <path class="i1" d="M 300 146 L 180 56"/>
  <path class="b2" d="M 306 150 L 186 60"/>
  <path class="i2" d="M 350 146 L 462 56"/>
  <path class="b1" d="M 344 150 L 456 60"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 300 146 L 180 56"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.5s" repeatCount="indefinite" path="M 350 146 L 462 56"/></circle>
  <text class="s" x="186" y="112" fill="#2b5ab8">inst 1 forwarding</text>
  <text class="s" x="186" y="126" fill="#1f9d6b" opacity=".7">inst 2 blocking</text>
  <text class="s" x="378" y="112" fill="#0f6b47">inst 2 forwarding</text>
  <text class="s" x="378" y="126" fill="#4b7bec" opacity=".7">inst 1 blocking</text>
  <text class="k" x="320" y="200" text-anchor="middle">Both uplinks carry traffic. Every VLAN still has exactly one loop-free path.</text>
</svg>
<p class="walk-say"><span class="walk-title">The payoff: both uplinks forward</span>
Make DIST-A the root for instance 1 and DIST-B the root for instance 2. Now the access switch forwards instance 1's VLANs up the left uplink and instance 2's up the right, and blocks the other on each. Nothing is idle.
<br><br>This is exactly what people build by hand in Rapid PVST+ with per-VLAN priorities — <b>except that here you set it twice instead of four hundred times</b>, and adding VLAN 401 tomorrow needs one mapping line rather than another priority statement on every switch.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One switch with a different region name is treated as an external bridge and its internal instances collapse onto the IST">
  <style>.sv6 .n{fill:#17171A}.sv6 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv6 .l{stroke:#1f9d6b;stroke-width:3}.sv6 .bad{stroke:#D3002D;stroke-width:3}.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect x="34" y="40" width="380" height="76" fill="rgba(31,157,107,.07)" stroke="#1f9d6b" stroke-dasharray="5 4"/>
  <text class="k" x="224" y="32" text-anchor="middle" fill="#0f6b47">REGION &#8220;CAMPUS&#8221;</text>
  <rect class="n" x="70" y="62" width="76" height="34" rx="3"/><text class="nt" x="108" y="84" text-anchor="middle">SW1</text>
  <rect class="n" x="290" y="62" width="76" height="34" rx="3"/><text class="nt" x="328" y="84" text-anchor="middle">SW2</text>
  <line class="l" x1="146" y1="79" x2="290" y2="79"/>
  <rect x="440" y="40" width="180" height="76" fill="#FFF1F3" stroke="#D3002D" stroke-dasharray="5 4"/>
  <text class="k" x="530" y="32" text-anchor="middle" fill="#B80027">REGION &#8220;Campus&#8221;</text>
  <rect class="n" x="492" y="62" width="76" height="34" rx="3"/><text class="nt" x="530" y="84" text-anchor="middle">SW3</text>
  <line class="bad" x1="366" y1="79" x2="492" y2="79"/>
  <text class="m" x="429" y="60" text-anchor="middle" fill="#D3002D">boundary</text>
  <text class="m" x="108" y="136" text-anchor="middle">digest 0x1F2E…</text>
  <text class="m" x="328" y="136" text-anchor="middle">digest 0x1F2E…</text>
  <text class="m" x="530" y="136" text-anchor="middle" fill="#D3002D">digest 0x9B77…</text>
  <rect x="14" y="156" width="612" height="56" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="176" fill="#B80027">One capital letter. That is the entire difference.</text>
  <text class="s" x="26" y="194">SW3 is now an external bridge. Its instances collapse onto the IST at the boundary, its VLANs all take one path,</text>
  <text class="s" x="26" y="208">and your carefully balanced uplinks stop balancing. Nothing is down and nothing is logged as an error.</text>
</svg>
<p class="walk-say"><span class="walk-title">The failure you will actually meet</span>
Region membership is all-or-nothing and it is <b>case sensitive</b>. <code>CAMPUS</code> and <code>Campus</code> are different regions. So are revision 3 and revision 30. So is a mapping where one switch has VLAN 55 in instance 1 and everyone else has it in instance 2 — because the digest covers the whole table.
<br><br>The symptom is never "spanning tree is broken". It is <b>suboptimal paths, an uplink that stopped sharing load, or a VLAN that takes the long way round</b>. Diagnosis is one command: compare <code>show spanning-tree mst configuration</code> on both switches and look at the digest, not the name.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">spanning-tree mode mst</span>
!
<span class="t">spanning-tree mst configuration</span>
 <span class="t">name</span> <span class="opt">CAMPUS</span>
 <span class="t">revision</span> <span class="opt">3</span>
 <span class="t">instance 1 vlan</span> <span class="opt">1-99,201-299</span>
 <span class="t">instance 2 vlan</span> <span class="opt">100-199,300-399</span>
!
<span class="t">spanning-tree mst 1 priority</span> <span class="opt">24576</span>
<span class="t">spanning-tree mst 2 priority</span> <span class="opt">28672</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>spanning-tree mode mst</dt><dd>Switches the whole box from Rapid PVST+ to MST. <b>This reconverges every VLAN on the switch immediately.</b> It is not a change to make during business hours, and it is not a change to make on one switch at a time unless you have thought about the boundary that temporarily creates.</dd></div>
<div class="is-key"><dt>name CAMPUS</dt><dd>32 bytes, <b>case sensitive</b>, and trailing whitespace counts. Pick something short, all one case, and put it in your build template so nobody types it by hand twice.</dd></div>
<div class="is-key"><dt>revision 3</dt><dd>A number with no meaning to the protocol beyond "must match". Use it as a version stamp for the mapping: change the mapping, bump the revision — but remember that until every switch has both changes, the ones that differ are in a different region.</dd></div>
<div class="is-key"><dt>instance 1 vlan<br>1-99,201-299</dt><dd>The mapping, and the thing the digest is computed over. <b>Any VLAN not named here stays in instance 0</b>, the IST, which is a perfectly valid place for it but not usually what you meant. Map ranges generously — including VLANs that do not exist yet — so that creating VLAN 250 next year needs no MST change at all.</dd></div>
<div><dt>spanning-tree mst 1<br>priority 24576</dt><dd>Per-instance root election, exactly like per-VLAN priority in PVST+. Lower wins; must be a multiple of 4096. Set instance 1 low on DIST-A and instance 2 low on DIST-B, and set the <em>second</em> priority on each as backup — that is how you get both uplinks forwarding and a predictable failure.</dd></div>
<div><dt>(not shown)</dt><dd><code>show pending</code> before <code>exit</code>, always. And note that <b>instance 0 also needs a root</b> — if you never set <code>spanning-tree mst 0 priority</code>, the IST root is elected by MAC address, which puts the most important topology in your network in the hands of whichever switch is oldest.</dd></div>
</dl>
</div>

### Verifying — and the one command that finds the fault

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — compare the digest before you compare anything else</div>
<pre><span class="p">SW1#</span> <span class="c">show spanning-tree mst configuration</span>
Name      [<span class="y">CAMPUS</span>]
Revision  <span class="y">3</span>     Instances configured 3
Instance  Vlans mapped
--------  ---------------------------------------------------------------------
0         400-4094
<span class="y">1</span>         <span class="y">1-99,201-299</span>
<span class="y">2</span>         100-199,300-399
-------------------------------------------------------------------------------

<span class="p">SW1#</span> <span class="c">show spanning-tree mst configuration digest</span>
Name      [CAMPUS]
Revision  3     Instances configured 3
<span class="g">Digest              0x1F2E4A88C5D3907B6E1A45F2C8B0D739</span>
Pre-std Digest      0x9A44B21E7C6F0538D9E2A1B4C7F60E25

<span class="o">! THIS is the comparison that matters. Run it on both switches and diff the digest.</span>
<span class="o">! 0xAC36177F50283CD4B83821D8AB26DE62 means nothing was ever mapped.</span>

<span class="p">SW1#</span> <span class="c">show spanning-tree mst 1</span>
##### MST1    vlans mapped:   1-99,201-299
Bridge        address 00aa.bbcc.dd00  priority  <span class="y">24577 (24576 sysid 1)</span>
Root          <span class="g">this switch for MST1</span>

Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- --------------------------------
Gi1/0/1          Desg FWD 20000     128.1    P2p
Gi1/0/2          Desg FWD 20000     128.2    P2p

<span class="p">SW1#</span> <span class="c">show spanning-tree mst interface gi1/0/1</span>
GigabitEthernet1/0/1 of MST0 is designated forwarding
Edge port: no            Port guard : none
Link type: point-to-point
<span class="r">Boundary  : internal</span>         <span class="o">&lt;- "boundary: internal" = same region. Anything else = investigate.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two words decide everything.</b> <code>Boundary: internal</code> means the neighbour is in your region. <code>Boundary: PVST</code> or <code>Boundary: RSTP</code> means it is not — either deliberately, at the edge of your MST domain, or accidentally, because a digest differs. On a link between two switches you believe are both in region CAMPUS, "boundary" is the fault.</p>

---

## Meeting the outside world

Not everything will be MST. A region has to coexist with Rapid PVST+ switches, other regions, and plain 802.1D.

The mechanism is simple and slightly startling: **the entire region pretends to be a single bridge**. External switches see one bridge ID, running one spanning tree, no matter how many switches and instances are inside. All internal topology is invisible.

At a boundary port, only the IST participates externally, and **all the region's instances follow the IST's decision there**. If the IST blocks a boundary port, every VLAN is blocked on it, regardless of which instance they are in.

<div class="warn">
<b>PVST simulation, and how it bites</b>
Cisco switches run <b>PVST simulation</b> on boundary ports so an MST region can talk to Rapid PVST+. It works — but it imposes a rule: the MST region <b>must be the root</b> for every VLAN, or must consistently lose for all of them. If a PVST+ switch is root for some VLANs and the MST region is root for others, the simulation cannot reconcile it and the port is put into <b>root-inconsistent</b> state:
<br><br><code>%SPANTREE-2-PVSTSIM_FAIL: Blocking designated port Gi1/0/24: inconsistent inferior PVST BPDU received on VLAN 20</code>
<br><br>This is the classic MST-migration incident. You convert the distribution layer to MST, some access switch is still PVST+ and happens to be root for one VLAN, and a port blocks. The fix is to make the MST region unambiguously the root for everything — set <code>spanning-tree mst 0 priority</code> low on your distribution pair <b>before</b> you migrate anything.
</div>

---

## What goes wrong

**Load sharing stopped working after a switch replacement.** Digest mismatch. The new switch has the region name typed slightly differently, or the mapping was never applied. `show spanning-tree mst configuration digest` on both.

**A port says `Boundary: PVST` between two MST switches.** Same cause. They are not in the same region.

**Every VLAN takes the same path.** Everything is still in instance 0 — either you never mapped, or the mapping did not commit because you left the sub-mode with `abort`.

**A boundary port is root-inconsistent.** PVST simulation failure. The MST region is not root for all VLANs.

**The whole network reconverged when I changed one VLAN mapping.** Expected. The mapping is the digest, and changing it changes the region. Plan mapping changes like topology changes, because that is what they are.

**MST is configured, the digest matches, and one VLAN still has no path.** Check the VLAN actually exists and is allowed on the trunks. MST decides topology; it does not carry VLANs that the trunk is not permitted to carry.

---

<div class="lab">
<div class="lab-head">Lab — build a region, load-share two uplinks, then break it with one keystroke</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Convert a working Rapid PVST+ triangle to MST without losing the network; get both uplinks forwarding using two instances; compare digests before and after so you can recognise the default one on sight; then produce a region split from a single character of difference, and a PVST simulation failure, and recognise each from its symptom.</div>

**Topology.** DIST-A and DIST-B, both connected to each other and to one ACCESS switch — a triangle. VLANs 10, 20, 30, 40 on all three. Hosts in VLAN 10 and VLAN 20 on ACCESS.

<p class="lab-step"><span class="n">1</span>Record the "before"</p>

```cisco
ACCESS# show spanning-tree vlan 10
ACCESS# show spanning-tree vlan 20
ACCESS# show spanning-tree summary | include VLAN|instances
```

<div class="lab-watch"><b>Things to notice</b>
Count the instances. With four VLANs you have four spanning trees; imagine that number at 400. Note which uplink is blocking for each VLAN — with default priorities, <b>the same uplink blocks for all of them</b>, which means half your uplink capacity is idle. Write down the blocked port; you are about to change it.</div>

<p class="lab-step"><span class="n">2</span>Stage the region and read it before committing</p>

On **all three** switches:

```cisco
spanning-tree mst configuration
 name CAMPUS
 revision 1
 instance 1 vlan 10,30
 instance 2 vlan 20,40
```

Before typing `exit`:

```cisco
SW(config-mst)# show pending
```

<div class="lab-watch"><b>Things to notice</b>
<code>show pending</code> displays the configuration you are about to apply, not the one running. Try <code>abort</code> on one switch and confirm with <code>show spanning-tree mst configuration</code> that nothing changed — then redo it. Knowing that <code>abort</code> exists is worth a lot the day you realise mid-edit that you mapped the wrong range.</div>

<p class="lab-step"><span class="n">3</span>Commit, then turn on MST</p>

`exit` on all three, then compare digests **before** changing the mode:

```cisco
SW# show spanning-tree mst configuration digest
```

All three must print the same value. Only then:

```cisco
spanning-tree mode mst
```

<div class="lab-watch"><b>Things to notice</b>
Compare the digest now with the default <code>0xAC36177F50283CD4B83821D8AB26DE62</code> — it is completely different, because the mapping table changed. This ordering is the professional habit worth taking away: <b>get the digests matching everywhere first, then switch the mode</b>. Doing it the other way round means every switch you have not converted yet is in a different region, and you spend the migration watching the topology thrash.</div>

<p class="lab-step"><span class="n">4</span>Make both uplinks forward</p>

```cisco
! DIST-A
spanning-tree mst 0 priority 24576
spanning-tree mst 1 priority 24576
spanning-tree mst 2 priority 28672

! DIST-B
spanning-tree mst 0 priority 28672
spanning-tree mst 1 priority 28672
spanning-tree mst 2 priority 24576
```

```cisco
ACCESS# show spanning-tree mst 1
ACCESS# show spanning-tree mst 2
```

<div class="lab-watch"><b>Things to notice</b>
Instance 1 should have its root port toward DIST-A and instance 2 toward DIST-B, with the other uplink blocking in each. <b>Both physical uplinks are now forwarding traffic</b> — run a ping from a VLAN 10 host and a VLAN 20 host simultaneously and watch the interface counters on both uplinks climb.
<br><br>Now note that you achieved this with two priority statements per switch. In Rapid PVST+ the same result needs one per VLAN, and a new VLAN needs another one on every switch, for ever.</div>

<p class="lab-step"><span class="n">5</span>Break the region with one character</p>

On ACCESS only:

```cisco
spanning-tree mst configuration
 name Campus
exit
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing appears to happen</b> — correct. Check <code>show spanning-tree mst interface gi1/0/1</code> and look for <code>Boundary: internal</code> changing to a boundary. Then re-check which uplinks forward: the load sharing is gone, because ACCESS's instances now collapse onto the IST at both boundaries.</li>
<li><b>You cannot see the difference in <code>show spanning-tree mst configuration</code></b> — that is the point; <code>CAMPUS</code> and <code>Campus</code> look almost identical in a terminal. Use <code>... digest</code> and compare hex, which is unmissable.</li>
<li><b>The whole network reconverges</b> — expected, and worth timing.</li>
</ul>
Fix the name, then repeat the experiment with <b>revision 2 instead of 1</b>, and again by moving <b>VLAN 30 into instance 2</b> on one switch only. All three produce the same digest mismatch from three completely different-looking mistakes.</div>

<p class="lab-step"><span class="n">6</span>Force a PVST simulation failure</p>

Put ACCESS back to `spanning-tree mode rapid-pvst` while DIST-A and DIST-B stay MST. Then make ACCESS the root for VLAN 20 only:

```cisco
ACCESS(config)# spanning-tree vlan 20 priority 4096
```

<div class="lab-watch"><b>Things to notice</b>
Watch for <code>%SPANTREE-2-PVSTSIM_FAIL</code> and a boundary port going <b>root-inconsistent</b>. Confirm with <code>show spanning-tree inconsistentports</code>. The region can tolerate being root for all VLANs or none, but not some — and the log message says exactly that if you read it.
<br><br>Fix it by lowering the MST region's <code>mst 0</code> priority below anything PVST+ can claim. This is the exact sequence that causes real migration outages, and having produced it deliberately once is the difference between recognising it in thirty seconds and in three hours.</div>

<div class="lab-earned"><b>What you earned</b>
You can migrate a live network to MST in the safe order — map everywhere, verify digests match, then change the mode — instead of the order that thrashes the topology. You recognise <code>0xAC36177F…</code> on sight as "nothing was mapped here", which is a diagnosis in one glance. You know that region membership fails on a capital letter, a revision number or one VLAN in the wrong instance, that all three look identical from the symptom, and that the digest tells all three apart. And you have seen a PVST simulation failure with your own log message, so the next one you meet during somebody else's migration will take minutes.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Which three things must match for two switches to be in the same MST region?</p>
<label class="qz-opt"><input type="radio" name="mst1"><span>Region name, revision number, and VLAN-to-instance mapping</span><em class="qz-fb qz-good">Correct — and all three are hashed into the digest that travels in every BPDU, which is why comparing digests finds all three faults at once.</em></label>
<label class="qz-opt"><input type="radio" name="mst1"><span>Region name, bridge priority, and VTP domain</span><em class="qz-fb qz-bad">Priority elects roots and VTP is unrelated. Neither affects region membership.</em></label>
<label class="qz-opt"><input type="radio" name="mst1"><span>Revision number, instance count, and root bridge</span><em class="qz-fb qz-bad">The instance count follows from the mapping, and the root is an outcome, not a membership test.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>A switch shows digest <code>0xAC36177F50283CD4B83821D8AB26DE62</code>. What does that tell you?</p>
<label class="qz-opt"><input type="radio" name="mst2"><span>The MST configuration is corrupt</span><em class="qz-fb qz-bad">It is perfectly valid — it is just the default.</em></label>
<label class="qz-opt"><input type="radio" name="mst2"><span>No VLANs have been mapped — everything is still in instance 0</span><em class="qz-fb qz-good">Right. That is the digest of the default table with all 4094 VLANs in the IST. Seeing it on a switch you thought you configured means the mapping never committed.</em></label>
<label class="qz-opt"><input type="radio" name="mst2"><span>The switch is running PVST+, not MST</span><em class="qz-fb qz-bad">A PVST+ switch has no MST digest to show at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>How many BPDUs does an MST switch send per trunk with 400 VLANs in 2 instances?</p>
<label class="qz-opt"><input type="radio" name="mst3"><span>400 — one per VLAN</span><em class="qz-fb qz-bad">That is Rapid PVST+, and it is the reason MST exists.</em></label>
<label class="qz-opt"><input type="radio" name="mst3"><span>One — the IST BPDU, carrying an M-record for the other instance</span><em class="qz-fb qz-good">Correct. Only instance 0 transmits; every other instance travels inside it as 16 extra bytes. The control plane no longer scales with VLAN count.</em></label>
<label class="qz-opt"><input type="radio" name="mst3"><span>Two — one per instance</span><em class="qz-fb qz-bad">Close to the intuition, but the second instance does not get its own BPDU. It rides in the first.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A port between two switches you configured identically shows <code>Boundary: PVST</code>. What is wrong?</p>
<label class="qz-opt"><input type="radio" name="mst4"><span>The neighbour is running PVST+</span><em class="qz-fb qz-bad">Possible, but the question says both were configured for MST — so suspect the more common cause first.</em></label>
<label class="qz-opt"><input type="radio" name="mst4"><span>The digests differ, so they are not in the same region</span><em class="qz-fb qz-good">Correct — a case difference in the name, a different revision, or one VLAN in the wrong instance. Compare <code>show spanning-tree mst configuration digest</code> on both.</em></label>
<label class="qz-opt"><input type="radio" name="mst4"><span>The trunk is not allowing all VLANs</span><em class="qz-fb qz-bad">The allowed list affects which VLANs cross, not region membership.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does <code>exit</code> from MST configuration mode deserve care?</p>
<label class="qz-opt"><input type="radio" name="mst5"><span>It commits the staged mapping, which changes the digest and reconverges the network</span><em class="qz-fb qz-good">Exactly. The sub-mode stages everything so there is one change rather than one per line — which makes that single keystroke the production-affecting one. <code>show pending</code> first.</em></label>
<label class="qz-opt"><input type="radio" name="mst5"><span>It saves the running configuration</span><em class="qz-fb qz-bad">It does not write anything to startup-config.</em></label>
<label class="qz-opt"><input type="radio" name="mst5"><span>It has no effect — MST commands apply as you type them</span><em class="qz-fb qz-bad">MST configuration mode is one of the few IOS modes that genuinely stages its changes.</em></label>
</div>

---

## References

- **IEEE 802.1s** — Multiple Spanning Trees, now incorporated into 802.1Q. The region definition, the digest and the M-record format come from it.
- Cisco — [Understand the Multiple Spanning Tree Protocol (802.1s)](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/24248-147.html) — the clearest explanation of regions, the IST and boundary behaviour.
- Cisco — [Configuring Multiple Spanning-Tree Protocol](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-2/configuration_guide/lyr2/b_172_lyr2_9300_cg/configuring_multiple_spanning_tree_protocol.html) — instance limits and the configuration sub-mode.
- Cisco — [Troubleshoot MST on Catalyst 9000 Switches](https://www.cisco.com/c/en/us/support/docs/lan-switching/stp/218351-troubleshoot-mst-on-catalyst-9000-switch.html)

---

*Earlier in ENCOR 3.1: [802.1Q trunking, the native VLAN and DTP](/blog/dot1q-trunking-native-vlan-and-dtp-explained) · [EtherChannel: LACP, PAgP and load balancing](/blog/etherchannel-lacp-pagp-and-load-balancing-explained) · [Spanning tree: root election, port roles and RSTP](/blog/spanning-tree-explained-root-election-port-roles-rstp).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
