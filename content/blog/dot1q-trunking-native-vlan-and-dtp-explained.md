---
title: "802.1Q Trunking, the Native VLAN, and Why DTP Should Be Switched Off"
excerpt: "A trunk is one cable carrying many VLANs, and the entire mechanism is four bytes inserted after the source MAC. Everything that goes wrong with trunks comes from one of three things: which VLANs are allowed, which VLAN is untagged, and a negotiation protocol that decides what kind of port you have without asking you. Here is the tag byte by byte, the native VLAN mismatch that silently merges two broadcast domains, and the attack that makes DTP a security problem rather than a convenience."
date: "2026-09-21"
tags: ["802.1Q", "VLAN", "Trunking", "DTP", "Switching", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 3.1.a *Troubleshoot static and dynamic 802.1q trunking protocols*. CCNA 200-301 — 2.2 *Configure and verify interswitch connectivity: trunk ports, 802.1Q, native VLAN*, and the trunking half of 2.1.

## Cheat sheet

| | |
|---|---|
| **Tag length** | **4 bytes**, inserted after the source MAC |
| **TPID** | `0x8100` — where the EtherType normally sits |
| **TCI** | 3 bits **PCP** (priority) · 1 bit **DEI** · **12 bits VLAN ID** |
| **VLAN ID range** | 0–4095; **1–4094 usable**, 0 = priority-only, 4095 reserved |
| **Normal range** | 1–1005 · **Extended range** 1006–4094 |
| **Max frame** | 1518 → **1522** bytes with a tag ("baby giant") |
| **Native VLAN** | Sent **untagged**. Default **VLAN 1** |
| **DTP** | Cisco proprietary, every **30 s**, to `01:00:0C:CC:CC:CC` |
| **ISL** | Cisco's old 30-byte encapsulation. **Dead** — no modern platform supports it |

**The whole idea in one line.** An access port decides a frame's VLAN by *which port it arrived on*. A trunk port cannot do that, because one port carries many VLANs — so the VLAN number is written into the frame itself, and stripped again at the far end.

---

## The problem a trunk solves

Two switches, three VLANs. Without trunking you need three cables — one per VLAN, each a plain access port at both ends. Six VLANs, six cables. Any new VLAN means physically patching another link.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Without trunking each VLAN needs its own cable between switches; with trunking one tagged link carries all of them">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .v10{stroke:#4b7bec;stroke-width:2.5}.v20{stroke:#1f9d6b;stroke-width:2.5}.v30{stroke:#F2994A;stroke-width:2.5}
    .tr{stroke:#17171A;stroke-width:4}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.06em}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
  </style>
  <text class="hdr" x="14" y="16" fill="#D3002D">ONE CABLE PER VLAN — DOES NOT SCALE</text>
  <rect class="n" x="24" y="52" width="60" height="58" rx="3"/><text class="nt" x="54" y="86" text-anchor="middle">SW1</text>
  <rect class="n" x="210" y="52" width="60" height="58" rx="3"/><text class="nt" x="240" y="86" text-anchor="middle">SW2</text>
  <line class="v10" x1="84" y1="64" x2="210" y2="64"/>
  <line class="v20" x1="84" y1="81" x2="210" y2="81"/>
  <line class="v30" x1="84" y1="98" x2="210" y2="98"/>
  <text class="s" x="147" y="58" text-anchor="middle" fill="#2b5ab8">VLAN 10</text>
  <text class="s" x="147" y="75" text-anchor="middle" fill="#0f6b47">VLAN 20</text>
  <text class="s" x="147" y="92" text-anchor="middle" fill="#B26014">VLAN 30</text>
  <text class="k" x="147" y="132" text-anchor="middle" fill="#D3002D">3 VLANs = 3 cables = 6 ports</text>
  <text class="s" x="147" y="148" text-anchor="middle">every new VLAN is a site visit</text>
  <line x1="320" y1="14" x2="320" y2="170" stroke="#ECECEF"/>
  <text class="hdr" x="360" y="16" fill="#0f6b47">ONE TRUNK — ALL OF THEM</text>
  <rect class="n" x="378" y="52" width="60" height="58" rx="3"/><text class="nt" x="408" y="86" text-anchor="middle">SW1</text>
  <rect class="n" x="556" y="52" width="60" height="58" rx="3"/><text class="nt" x="586" y="86" text-anchor="middle">SW2</text>
  <line class="tr" x1="438" y1="81" x2="556" y2="81"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 438 81 L 556 81"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.6s" repeatCount="indefinite" path="M 438 81 L 556 81"/></circle>
  <circle r="4" fill="#F2994A"><animateMotion dur="1.8s" begin="1.2s" repeatCount="indefinite" path="M 438 81 L 556 81"/></circle>
  <text class="s" x="497" y="68" text-anchor="middle">each frame carries its own VLAN number</text>
  <text class="k" x="497" y="132" text-anchor="middle" fill="#0f6b47">3 VLANs — or 400 — = 1 cable</text>
  <text class="s" x="497" y="148" text-anchor="middle">a new VLAN is one line of config</text>
  <rect x="14" y="184" width="612" height="52" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="s" x="26" y="204" font-weight="700" fill="#17171A">The cost of the trick:</text>
  <text class="s" x="146" y="204">both ends must agree on what the numbers mean, which VLANs may cross,</text>
  <text class="s" x="26" y="220">and which single VLAN travels with no number at all. Every trunk fault in this article is one of those three disagreements.</text>
</svg>
<figcaption><b>Figure 1.</b> Trunking does not add capability — it removes cables. What it adds is three things two switches now have to agree about.</figcaption>
</figure>

---

## The tag, byte by byte

An untagged Ethernet frame is: destination MAC, source MAC, EtherType, payload. 802.1Q inserts its four bytes **between the source MAC and the EtherType** — so the EtherType moves four bytes to the right, and `0x8100` takes its place.

<figure class="fig">
<svg viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The four byte 802.1Q tag is inserted after the source MAC address, pushing the EtherType right, and its second half splits into priority, DEI and a twelve bit VLAN ID">
  <style>
    .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;fill:#8A8A93;letter-spacing:.07em}
    .lbl{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}
    .mono{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}
    .fld{fill:#F1EEE9;stroke:#B5B5BC}
    .tag{fill:rgba(211,0,45,.12);stroke:#D3002D}
    .k{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}
  </style>
  <text class="hdr" x="14" y="16">UNTAGGED</text>
  <rect class="fld" x="14" y="26" width="120" height="26"/><text class="mono" x="74" y="43" text-anchor="middle">DST MAC</text>
  <rect class="fld" x="136" y="26" width="120" height="26"/><text class="mono" x="196" y="43" text-anchor="middle">SRC MAC</text>
  <rect class="fld" x="258" y="26" width="90" height="26"/><text class="mono" x="303" y="43" text-anchor="middle">0x0800</text>
  <rect class="fld" x="350" y="26" width="180" height="26"/><text class="mono" x="440" y="43" text-anchor="middle">PAYLOAD</text>
  <text class="lbl" x="14" y="64">6 bytes</text><text class="lbl" x="136" y="64">6 bytes</text><text class="lbl" x="258" y="64">EtherType</text>
  <text class="hdr" x="14" y="96">TAGGED — the same frame, four bytes longer</text>
  <rect class="fld" x="14" y="106" width="120" height="26"/><text class="mono" x="74" y="123" text-anchor="middle">DST MAC</text>
  <rect class="fld" x="136" y="106" width="120" height="26"/><text class="mono" x="196" y="123" text-anchor="middle">SRC MAC</text>
  <rect class="tag" x="258" y="106" width="60" height="26"/><text class="mono" x="288" y="123" text-anchor="middle" fill="#B80027">8100</text>
  <rect class="tag" x="320" y="106" width="60" height="26"/><text class="mono" x="350" y="123" text-anchor="middle" fill="#B80027">a014</text>
  <rect class="fld" x="382" y="106" width="70" height="26"/><text class="mono" x="417" y="123" text-anchor="middle">0x0800</text>
  <rect class="fld" x="454" y="106" width="172" height="26"/><text class="mono" x="540" y="123" text-anchor="middle">PAYLOAD</text>
  <text class="k" x="288" y="146" text-anchor="middle" fill="#B80027">TPID</text>
  <text class="k" x="350" y="146" text-anchor="middle" fill="#B80027">TCI</text>
  <text class="lbl" x="382" y="146">pushed right →</text>
  <path d="M 350 150 L 350 166" stroke="#D3002D" stroke-width="1.5" fill="none" marker-end="url(#dq)"/>
  <defs><marker id="dq" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#D3002D"/></marker></defs>
  <text class="hdr" x="14" y="182">THE TCI, BIT BY BIT — 0xA014</text>
  <rect class="fld" x="14" y="190" width="70" height="24" fill="rgba(75,123,236,.14)" stroke="#4b7bec"/>
  <text class="mono" x="49" y="206" text-anchor="middle">101</text>
  <rect class="fld" x="86" y="190" width="40" height="24" fill="rgba(242,153,74,.18)" stroke="#F2994A"/>
  <text class="mono" x="106" y="206" text-anchor="middle">0</text>
  <rect class="fld" x="128" y="190" width="230" height="24" fill="rgba(31,157,107,.14)" stroke="#1f9d6b"/>
  <text class="mono" x="243" y="206" text-anchor="middle">0000 0001 0100</text>
  <text class="lbl" x="16" y="226" fill="#2b5ab8">PCP 5</text>
  <text class="lbl" x="92" y="226" fill="#B26014">DEI</text>
  <text class="lbl" x="130" y="226" fill="#0f6b47">12 bits → VLAN 20 — the whole point of the tag. PCP 5 marks it as voice.</text>
  <text class="k" x="380" y="206" fill="#D3002D">4095 usable values, 1–4094</text>
</svg>
<figcaption><b>Figure 2.</b> Only twelve bits carry the VLAN. The three priority bits are why one field does double duty as the Layer 2 QoS marking — a trunk that is reset to access loses your CoS along with your VLAN.</figcaption>
</figure>

### Proof, in hex

The same ping, captured twice on the same wire — once on an access port, once on the trunk it crossed. The frames are **identical except for four bytes**.

<div class="cap">
<div class="cap-head">Capture · access port, VLAN 20 <span class="cap-filter">icmp</span></div>
<div class="cap-hex"><pre>0000  00 11 22 33 44 55 00 aa  bb cc dd ee <mark>08 00</mark> 45 00   .."3DU........E.
0010  00 34 2f 1a 00 00 80 01  cf 7a 0a 01 14 32 0a 01   .4/......z...2..
0020  14 01 08 00 e2 d6 00 01  00 07 61 62 63 64 65 66   ..........abcdef</pre></div>
<div class="cap-note"><b>66 bytes.</b> EtherType <code>08 00</code> sits at offset 12, immediately after the source MAC. Nothing in this frame says "VLAN 20" — the switch knows the VLAN because of <b>the port it arrived on</b>, and that knowledge exists only inside the switch.</div>
</div>

<div class="cap">
<div class="cap-head">Capture · the trunk, same ping <span class="cap-filter">vlan.id == 20</span></div>
<div class="cap-tree"><pre>▾ Ethernet II
    <span class="f">Destination:</span> <span class="v">00:11:22:33:44:55</span>
    <span class="f">Source:</span> <span class="v">00:aa:bb:cc:dd:ee</span>
    <span class="f">Type:</span> <span class="v"><mark>802.1Q Virtual LAN (0x8100)</mark></span>
▾ 802.1Q Virtual LAN, PRI: 5, DEI: 0, ID: 20
    <span class="f">000. .... .... ....</span> = <span class="v">Priority: Voice, &lt; 10ms latency (5)</span>
    <span class="f">...0 .... .... ....</span> = <span class="v">DEI: Ineligible</span>
    <span class="f">.... 0000 0001 0100</span> = <span class="v"><mark>ID: 20</mark></span>
    <span class="f">Type:</span> <span class="v">IPv4 (0x0800)</span>          ← the real EtherType, four bytes further in
▾ Internet Protocol Version 4
    <span class="f">Source:</span> <span class="v">10.1.20.50</span>   <span class="f">Destination:</span> <span class="v">10.1.20.1</span></pre></div>
<div class="cap-hex"><pre>0000  00 11 22 33 44 55 00 aa  bb cc dd ee <mark>81 00 a0 14</mark>   ................
0010  <mark>08 00</mark> 45 00 00 34 2f 1a  00 00 80 01 cf 7a 0a 01   ..E..4/......z..
0020  14 32 0a 01 14 01 08 00  e2 d6 00 01 00 07 61 62   .2............ab</pre></div>
<div class="cap-note"><b>70 bytes — exactly four more.</b> At offset 12 where <code>08 00</code> used to be there is now <code>81 00</code>, then <code>a0 14</code>, and the real EtherType <code>08 00</code> has shifted to offset 16. Every byte of the IP packet is untouched: <code>45 00 00 34 2f 1a</code>, the same identifier, the same checksum. <b>The tag is pure transport</b> — added on the way in, removed on the way out, and the end hosts never see it.</div>
</div>

<div class="note">
<b>Baby giants</b>
1518 bytes was the maximum Ethernet frame. A tag makes it 1522, which is legal under 802.1Q but was <em>not</em> legal under original 802.3 — hence "baby giant". Any modern switch handles it silently. Where it still bites is <b>anything that adds more headers</b>: a tag inside a QinQ provider tag, or a tagged frame entering a tunnel. That is where you start seeing giants counters increment and TCP sessions that establish and then hang on the first large transfer.
</div>

---

## Watch a frame cross a trunk

The tag exists only between the switches. Step through the whole journey:

<div class="walk">
<div class="walk-head">One ping, VLAN 20, PC to PC <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="dq" id="dq1" checked><label for="dq1"><span class="step-n">1</span>Leaves the PC</label>
  <input type="radio" name="dq" id="dq2"><label for="dq2"><span class="step-n">2</span>Tag added</label>
  <input type="radio" name="dq" id="dq3"><label for="dq3"><span class="step-n">3</span>On the trunk</label>
  <input type="radio" name="dq" id="dq4"><label for="dq4"><span class="step-n">4</span>Tag removed</label>
  <input type="radio" name="dq" id="dq5"><label for="dq5"><span class="step-n">5</span>Native VLAN</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A plain untagged frame leaves the PC and arrives on an access port">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#8A8A93}.f{fill:#F1EEE9;stroke:#B5B5BC}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <rect class="n" x="14" y="66" width="76" height="30" rx="3"/><text class="nt" x="52" y="86" text-anchor="middle">PC-A</text>
  <line class="l" x1="90" y1="81" x2="210" y2="81"/>
  <rect class="n" x="210" y="66" width="66" height="30" rx="3"/><text class="nt" x="243" y="86" text-anchor="middle">SW1</text>
  <text class="s" x="150" y="112" text-anchor="middle">access port · Gi1/0/1 · vlan 20</text>
  <circle r="4.5" fill="#8A8A93"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 90 81 L 210 81"/></circle>
  <rect class="f" x="330" y="60" width="66" height="22"/><text class="m" x="363" y="75" text-anchor="middle">DST</text>
  <rect class="f" x="398" y="60" width="66" height="22"/><text class="m" x="431" y="75" text-anchor="middle">SRC</text>
  <rect class="f" x="466" y="60" width="60" height="22"/><text class="m" x="496" y="75" text-anchor="middle">0800</text>
  <rect class="f" x="528" y="60" width="90" height="22"/><text class="m" x="573" y="75" text-anchor="middle">PAYLOAD</text>
  <text class="k" x="330" y="50">the frame on the wire — no tag anywhere</text>
  <text class="s" x="330" y="100">The PC has never heard of VLANs. It sends a plain Ethernet frame and always will.</text>
  <text class="s" x="330" y="116">The VLAN is a fact about the port, held by the switch, not by the frame.</text>
</svg>
<p class="walk-say"><span class="walk-title">Hosts do not do VLANs</span>
This matters more than it sounds. A PC, a printer, a camera — none of them tag. Everything about VLAN membership at the edge is a decision the <b>switch</b> makes based on <code>switchport access vlan 20</code>. The exceptions are servers with trunked NICs, hypervisors, and IP phones, which is exactly why those three are where VLAN problems cluster.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The switch inserts the four byte tag as the frame leaves the trunk port">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#B80027}.f{fill:#F1EEE9;stroke:#B5B5BC}.t{fill:rgba(211,0,45,.12);stroke:#D3002D}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <rect class="n" x="14" y="66" width="66" height="30" rx="3"/><text class="nt" x="47" y="86" text-anchor="middle">SW1</text>
  <text class="s" x="47" y="112" text-anchor="middle">Gi1/0/24</text>
  <line class="l" x1="80" y1="81" x2="230" y2="81" stroke-width="3.5"/>
  <text class="s" x="155" y="70" text-anchor="middle">trunk</text>
  <rect class="f" x="248" y="60" width="52" height="22"/><text class="m" x="274" y="75" text-anchor="middle">DST</text>
  <rect class="f" x="302" y="60" width="52" height="22"/><text class="m" x="328" y="75" text-anchor="middle">SRC</text>
  <rect class="t" x="356" y="60" width="46" height="22"><animate attributeName="opacity" values="0;1;1" dur="1.8s" repeatCount="indefinite"/></rect>
  <text class="m" x="379" y="75" text-anchor="middle" fill="#B80027">8100</text>
  <rect class="t" x="404" y="60" width="46" height="22"><animate attributeName="opacity" values="0;1;1" dur="1.8s" repeatCount="indefinite"/></rect>
  <text class="m" x="427" y="75" text-anchor="middle" fill="#B80027">a014</text>
  <rect class="f" x="452" y="60" width="52" height="22"/><text class="m" x="478" y="75" text-anchor="middle">0800</text>
  <rect class="f" x="506" y="60" width="112" height="22"/><text class="m" x="562" y="75" text-anchor="middle">PAYLOAD</text>
  <text class="k" x="356" y="50">these four bytes are inserted here, on egress</text>
  <text class="s" x="248" y="104">The switch looks up which VLAN the frame belongs to, writes 20 into the TCI,</text>
  <text class="s" x="248" y="120">and — if the access port had a CoS — writes the priority into the PCP bits.</text>
  <text class="s" x="248" y="136">Frame length goes 66 → 70. The FCS is recalculated, because the frame changed.</text>
</svg>
<p class="walk-say"><span class="walk-title">The tag is added on the way out</span>
Tagging happens at the <b>egress trunk port</b>, not on ingress. That is why a frame is only ever tagged while it is between two switches, and why a SPAN session mirroring an access port shows you untagged frames even though the traffic crosses tagged trunks two hops later.
<br><br>Note the FCS: the frame is materially different, so the checksum at the end is recomputed. A switch is not forwarding the frame — it is <b>rewriting</b> it.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Frames from several VLANs share the trunk, each carrying its own VLAN ID">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect class="n" x="24" y="66" width="66" height="34" rx="3"/><text class="nt" x="57" y="88" text-anchor="middle">SW1</text>
  <rect class="n" x="550" y="66" width="66" height="34" rx="3"/><text class="nt" x="583" y="88" text-anchor="middle">SW2</text>
  <line x1="90" y1="83" x2="550" y2="83" stroke="#17171A" stroke-width="4"/>
  <circle r="5" fill="#4b7bec"><animateMotion dur="2.4s" repeatCount="indefinite" path="M 90 83 L 550 83"/></circle>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="2.4s" begin="0.5s" repeatCount="indefinite" path="M 90 83 L 550 83"/></circle>
  <circle r="5" fill="#F2994A"><animateMotion dur="2.4s" begin="1s" repeatCount="indefinite" path="M 90 83 L 550 83"/></circle>
  <circle r="5" fill="#8256d0"><animateMotion dur="2.4s" begin="1.5s" repeatCount="indefinite" path="M 90 83 L 550 83"/></circle>
  <text class="s" x="120" y="62" fill="#2b5ab8">id 10</text>
  <text class="s" x="220" y="62" fill="#0f6b47">id 20</text>
  <text class="s" x="320" y="62" fill="#B26014">id 30</text>
  <text class="s" x="420" y="62" fill="#5b35a0">id 99</text>
  <text class="k" x="320" y="128" text-anchor="middle">One cable. Four broadcast domains. They never mix, because each frame says which one it is in.</text>
  <text class="s" x="320" y="150" text-anchor="middle">The trunk is not a VLAN. It is a pipe that carries VLANs — and the allowed list decides which ones get in.</text>
</svg>
<p class="walk-say"><span class="walk-title">Many VLANs, one wire, no mixing</span>
Isolation between VLANs is not weakened by sharing the cable. A switch receiving a tagged frame reads the VLAN ID and then treats that frame as belonging <b>only</b> to that VLAN — it will only ever be flooded or forwarded to ports in it.
<br><br>What <em>is</em> shared is bandwidth and fate. All four VLANs share one link's capacity, and all four go down together. That is the argument for an EtherChannel underneath the trunk rather than a single cable.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The far switch removes the tag before sending the frame out of an access port to the destination PC">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#0f6b47}.f{fill:#F1EEE9;stroke:#B5B5BC}.t{fill:rgba(211,0,45,.12);stroke:#D3002D}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <rect class="n" x="14" y="66" width="66" height="30" rx="3"/><text class="nt" x="47" y="86" text-anchor="middle">SW2</text>
  <line class="l" x1="80" y1="81" x2="200" y2="81"/>
  <rect class="n" x="200" y="66" width="76" height="30" rx="3"/><text class="nt" x="238" y="86" text-anchor="middle">PC-B</text>
  <text class="s" x="140" y="110" text-anchor="middle">access port · vlan 20</text>
  <circle r="4.5" fill="#8A8A93"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 80 81 L 200 81"/></circle>
  <rect class="f" x="330" y="60" width="66" height="22"/><text class="m" x="363" y="75" text-anchor="middle">DST</text>
  <rect class="f" x="398" y="60" width="66" height="22"/><text class="m" x="431" y="75" text-anchor="middle">SRC</text>
  <rect class="t" x="466" y="60" width="52" height="22" opacity=".25"><animate attributeName="opacity" values=".35;0;0" dur="1.8s" repeatCount="indefinite"/></rect>
  <text class="m" x="492" y="75" text-anchor="middle" fill="#D3002D" opacity=".4">8100</text>
  <rect class="f" x="520" y="60" width="44" height="22"/><text class="m" x="542" y="75" text-anchor="middle">0800</text>
  <rect class="f" x="566" y="60" width="52" height="22"/><text class="m" x="592" y="75" text-anchor="middle">DATA</text>
  <text class="k" x="440" y="50">tag stripped — back to 66 bytes</text>
  <text class="s" x="330" y="104">PC-B receives a byte-for-byte copy of what PC-A sent.</text>
  <text class="s" x="330" y="120">Neither host can tell a trunk was ever involved — which is the definition of working.</text>
</svg>
<p class="walk-say"><span class="walk-title">And removed on the way out</span>
The receiving switch reads VLAN 20 off the tag, does its normal MAC lookup <b>within VLAN 20</b>, finds the port, and strips the tag because that port is an access port. If the destination were on another trunk instead, the tag would be rewritten rather than removed.
<br><br>This is why a packet capture taken at a PC never shows a VLAN tag, and why "I can't see the VLAN in Wireshark" is not evidence of anything. To see tags you must capture <b>on the trunk</b>, or configure the SPAN session to encapsulate replicate.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Frames in the native VLAN cross the trunk with no tag at all, and a mismatch merges two different VLANs">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.f{fill:#F1EEE9;stroke:#B5B5BC}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <rect class="n" x="24" y="56" width="66" height="34" rx="3"/><text class="nt" x="57" y="78" text-anchor="middle">SW1</text>
  <rect class="n" x="550" y="56" width="66" height="34" rx="3"/><text class="nt" x="583" y="78" text-anchor="middle">SW2</text>
  <line x1="90" y1="73" x2="550" y2="73" stroke="#17171A" stroke-width="4"/>
  <circle r="5" fill="#8A8A93"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 90 73 L 550 73"/></circle>
  <text class="s" x="320" y="52" text-anchor="middle">a native-VLAN frame carries no tag — it looks exactly like an ordinary Ethernet frame</text>
  <text class="s" x="57" y="106" text-anchor="middle">native vlan 1</text>
  <text class="s" x="583" y="106" text-anchor="middle" fill="#D3002D">native vlan 99</text>
  <rect x="14" y="124" width="612" height="64" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="144" fill="#B80027">The mismatch, and why it is nasty</text>
  <text class="s" x="26" y="160">SW1 sends VLAN 1 untagged. SW2 receives an untagged frame and files it into VLAN 99. Two different</text>
  <text class="s" x="26" y="176">broadcast domains are now one, in one direction, with no link failure and nothing down. CDP shouts about it every 60 s.</text>
</svg>
<p class="walk-say"><span class="walk-title">The native VLAN — the one with no number</span>
Exactly one VLAN per trunk crosses <b>untagged</b>. It exists for backward compatibility with devices that cannot read tags, and it is the source of the two most-loved trunk faults: a <b>native VLAN mismatch</b>, which silently merges two broadcast domains, and <b>VLAN hopping</b>, where a host that can send its own tags puts a second tag inside a frame in the native VLAN and reaches a VLAN it was never allowed into.
<br><br>Both are fixed by the same two habits: set the native VLAN to an unused, shut VLAN on every trunk, and never leave it as 1.</p>
</div>
</div>
</div>

<div class="real">
<b>In the real world</b>
The native VLAN mismatch usually arrives disguised. Somebody replaces a switch, the new one comes up with the default native VLAN 1, and the old one was set to 999. Nothing goes down — spanning tree does not break, links stay up, and most traffic is unaffected because it is all tagged. What you get instead is a management VLAN that is quietly bridged into a user VLAN, DHCP offers from the wrong scope, and duplicate-IP alarms on devices that have never met. Check <code>show interfaces trunk</code> on both ends before you believe anything else.
</div>

---

## DTP, and why the answer is to turn it off

A trunk needs both ends configured. Cisco's **Dynamic Trunking Protocol** was invented so you would not have to: the ports negotiate and decide between themselves whether the link becomes a trunk.

It works. It is also the reason a port you thought was for a desk phone can become a trunk carrying every VLAN in the building.

| Local ↓ / Remote → | **access** | **dynamic auto** | **dynamic desirable** | **trunk** |
|---|---|---|---|---|
| **access** | access | access | access | **broken** |
| **dynamic auto** | access | **access** | trunk | trunk |
| **dynamic desirable** | access | trunk | trunk | trunk |
| **trunk** | **broken** | trunk | trunk | trunk |

Two rules are worth memorising: **auto + auto = access** (neither will start the conversation, so the link silently stays an access port — a classic "my trunk isn't coming up"), and **access + trunk = broken** (one end tags, the other does not; some traffic crosses, most does not).

<div class="warn">
<b>DTP is a security problem, not just an operational one</b>
A port left in <code>dynamic auto</code> or <code>dynamic desirable</code> will form a trunk with <b>anything that speaks DTP</b> — including a laptop running software that sends DTP frames. The attacker's port becomes a trunk, and they now receive and can inject into <b>every VLAN allowed on it</b>. This is switch-spoofing VLAN hopping, and it requires no exploit and no credentials — only a port that was never told what it is.
<br><br>The fix is three lines on every access port: <code>switchport mode access</code>, <code>switchport access vlan X</code>, and <code>switchport nonegotiate</code>. Hard-code every trunk too. There is no production network where DTP earns its risk.
</div>

<div class="cmd">
<div class="cmd-line">interface GigabitEthernet1/0/24
 <span class="t">switchport trunk encapsulation dot1q</span>
 <span class="t">switchport mode trunk</span>
 <span class="t">switchport nonegotiate</span>
 <span class="t">switchport trunk native vlan</span> <span class="opt">999</span>
 <span class="t">switchport trunk allowed vlan</span> <span class="opt">10,20,30</span></div>
<dl class="cmd-parts">
<div><dt>switchport trunk<br>encapsulation dot1q</dt><dd>Only needed on older platforms that also supported ISL. On anything modern the command does not exist, because dot1q is the only option. If a switch rejects <code>switchport mode trunk</code> with "command rejected", this missing line is usually why.</dd></div>
<div class="is-key"><dt>switchport mode trunk</dt><dd>Hard-codes the port as a trunk. It <b>still sends DTP frames</b> unless you stop it — a trunk-mode port is not a silent port.</dd></div>
<div class="is-key"><dt>switchport nonegotiate</dt><dd>Stops DTP frames entirely. Do this on <b>every</b> trunk and every access port. It is the difference between a port whose role you decided and a port whose role a neighbour can influence. On a trunk facing a non-Cisco device it is also required, since the DTP frames are just noise to them.</dd></div>
<div class="is-key"><dt>trunk native vlan 999</dt><dd>Moves the untagged VLAN off 1. Pick a VLAN that exists, carries nothing, and has no SVI. <b>Must match at both ends</b> — the mismatch is silent and merges broadcast domains. The alternative is <code>vlan dot1q tag native</code> globally, which tags everything and removes the concept entirely; cleaner where every device supports it.</dd></div>
<div class="is-key"><dt>trunk allowed vlan<br>10,20,30</dt><dd>The default is <b>1–4094 — everything</b>. Every VLAN you ever create is automatically carried on every trunk, including its broadcast traffic, across your whole campus. Pruning the list is the single highest-value line on this page. Beware <code>switchport trunk allowed vlan 40</code> — it <b>replaces</b> the list rather than adding to it; you want <code>allowed vlan add 40</code>. Doing that from a remote session on a trunk you just removed your own VLAN from is a well-known way to lose a switch.</dd></div>
</dl>
</div>

### Reading a trunk

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — the four commands that answer almost every trunk question</div>
<pre><span class="p">SW1#</span> <span class="c">show interfaces trunk</span>

Port        Mode         Encapsulation  Status        <span class="y">Native vlan</span>
Gi1/0/24    on           802.1q         <span class="g">trunking</span>      <span class="y">999</span>

Port        <span class="y">Vlans allowed on trunk</span>
Gi1/0/24    <span class="y">10,20,30</span>

Port        Vlans allowed and active in management domain
Gi1/0/24    10,20,30

Port        <span class="g">Vlans in spanning tree forwarding state and not pruned</span>
Gi1/0/24    <span class="g">10,20,30</span>

<span class="o">! Read those four lists top to bottom. Allowed but not active = the VLAN does not</span>
<span class="o">! exist on this switch. Active but not forwarding = spanning tree has blocked it.</span>
<span class="o">! That distinction is most of trunk troubleshooting.</span>

<span class="p">SW1#</span> <span class="c">show interfaces gi1/0/24 switchport</span>
Name: Gi1/0/24
Switchport: Enabled
<span class="y">Administrative Mode: trunk</span>
<span class="y">Operational Mode: trunk</span>                 <span class="o">&lt;- admin is what you asked for; operational is what happened</span>
Administrative Trunking Encapsulation: dot1q
Operational Trunking Encapsulation: dot1q
<span class="g">Negotiation of Trunking: Off</span>              <span class="o">&lt;- nonegotiate. This is what you want to see.</span>
Access Mode VLAN: 1 (default)
Trunking Native Mode VLAN: 999
Trunking VLANs Enabled: 10,20,30<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Administrative versus operational is the whole game.</b> "Administrative Mode: dynamic auto, Operational Mode: static access" is a trunk that never formed. "Administrative Mode: trunk, Operational Mode: static access" means the far end refused. If the two lines differ, stop reading anything else and go and look at the other switch.</p>

---

## What goes wrong

**The trunk never comes up.** Both ends are `dynamic auto`. Neither initiates. Hard-code both.

**One VLAN works, another does not.** It is not on the allowed list at one end, or it does not exist in the VLAN database on the far switch. `show interfaces trunk` distinguishes the two.

**Everything works except one VLAN, and only in one direction.** Allowed lists that differ between the ends. They are configured independently and nothing enforces symmetry.

**Two VLANs have merged.** Native VLAN mismatch. CDP logs `%CDP-4-NATIVE_VLAN_MISMATCH` every 60 seconds and everybody has learned to ignore it.

**A new VLAN does not reach a remote site.** Somebody used `switchport trunk allowed vlan` without `add`, wiping the list on one switch, months ago. Everything that already existed kept working.

**Frames arrive with an unexpected VLAN, or a host reaches a VLAN it should not.** Check for a port in `dynamic auto`, and check whether the attacker's VLAN is the native VLAN. That is the double-tagging path.

**Random large-frame failures across a trunk.** MTU. The tag makes frames 1522 bytes, and something in the path is not configured for it — often a media converter, a wireless bridge, or a provider link.

---

<div class="lab">
<div class="lab-head">Lab — build a trunk, find the four bytes, then break it four ways</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Put a tagged frame under a microscope and find the tag in the hex yourself; prove the native VLAN travels untagged by capturing both on the same wire; produce a native VLAN mismatch and watch two broadcast domains merge while nothing goes down; and demonstrate that a port left on DTP defaults will form a trunk with something that is not a switch.</div>

**Topology.** SW1 and SW2 joined by one link. VLANs 10, 20 and 999 on both. PC-A on SW1 in VLAN 20, PC-B on SW2 in VLAN 20, PC-C on SW1 in VLAN 10. A capture machine on a SPAN destination port.

<p class="lab-step"><span class="n">1</span>Start with nothing configured</p>

Leave both switch ports at their defaults and look before you touch anything:

```cisco
SW1# show interfaces gi1/0/24 switchport | include Mode
SW2# show interfaces gi1/0/24 switchport | include Mode
SW1# show interfaces trunk
```

<div class="lab-watch"><b>Things to notice</b>
Whether a trunk formed on its own tells you the platform's default DTP mode — and it differs between switch families, which is exactly why you should never rely on it. Write down what you found. Then set <b>both</b> ends to <code>switchport mode dynamic auto</code> and watch the trunk drop to an access port: neither end will start the negotiation, and the interface stays up the whole time. Nothing is "down". That is the fault people spend an hour on.</div>

<p class="lab-step"><span class="n">2</span>Build the trunk properly and capture the tag</p>

```cisco
! Both switches
interface GigabitEthernet1/0/24
 switchport mode trunk
 switchport nonegotiate
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,999
```

Now mirror the trunk to your capture port — and this part matters:

```cisco
monitor session 1 source interface Gi1/0/24
monitor session 1 destination interface Gi1/0/48 encapsulation replicate
```

Ping from PC-A to PC-B and capture.

<div class="lab-watch"><b>Things to notice</b>
<code>encapsulation replicate</code> is the whole point. <b>Without it the SPAN destination strips the tags</b> and you will capture the traffic without ever seeing an 802.1Q header — and conclude, wrongly, that the trunk is not tagging. With it, open the ICMP echo, look at offset 12 in the hex, and find <code>81 00</code>. The two bytes after it are the TCI; convert them to binary and read the bottom twelve bits. They should say 20.
<br><br>Then check the frame length: 70 bytes, against 66 for the same ping captured on the access port.</div>

<p class="lab-step"><span class="n">3</span>Prove the native VLAN is untagged</p>

Put PC-C into VLAN 999 temporarily and ping across the trunk. Capture again with the filter `not vlan`.

<div class="lab-watch"><b>Things to notice</b>
These frames have <b>no tag at all</b> — they are indistinguishable from traffic on a plain access link. You are watching a frame cross a trunk with nothing in it that says which VLAN it belongs to; the receiving switch assigns it purely from the native VLAN setting. Once you have seen that, double-tagging stops being an abstract exam topic: the outer tag is what the sending switch strips, and if the outer tag matches the native VLAN the inner one survives into a VLAN the host was never allowed into.</div>

<p class="lab-step"><span class="n">4</span>Create a native VLAN mismatch on purpose</p>

```cisco
! SW2 only
interface GigabitEthernet1/0/24
 switchport trunk native vlan 1
```

Leave it for two minutes with continuous pings running between VLANs 10 and 20.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing appears to break</b> — correct, and that is the lesson. Tagged VLANs are unaffected. Look for the damage in the untagged VLAN only.</li>
<li><b>No CDP message</b> — CDP may be disabled on the interface. <code>cdp enable</code>, then wait up to 60 s for <code>%CDP-4-NATIVE_VLAN_MISMATCH</code>.</li>
<li><b>Spanning tree starts flapping</b> — on some platforms a native mismatch puts the port into broken state for PVST+. If that happens, note it: it is the <em>better</em> outcome, because at least something told you.</li>
</ul>
Put a host in VLAN 999 on SW1 and a host in VLAN 1 on SW2 and ping between them. <b>They will reach each other</b> — two VLANs that share no number and no configuration, bridged by an untagged frame. Now <code>show mac address-table</code> on both and see each switch has learned the other's host in a different VLAN.</div>

<p class="lab-step"><span class="n">5</span>Show that DTP will trunk with a stranger</p>

Set SW1's port back to `switchport mode dynamic auto` and remove `nonegotiate`. From a Linux machine on that port, send DTP desirable frames — `yersinia -G`, or any DTP tool.

<div class="lab-watch"><b>Things to notice</b>
The switch forms a trunk with a laptop. Run <code>show interfaces trunk</code> on the switch and your laptop's port is listed, carrying every allowed VLAN. Capture on the laptop and you now see tagged traffic from VLANs you were never meant to reach, and you can send into them by tagging your own frames.
<br><br>No exploit was used. The port was simply never told what it was. Then apply <code>switchport mode access</code> + <code>switchport nonegotiate</code> and repeat — the tool gets no reply at all.</div>

<p class="lab-step"><span class="n">6</span>Cut yourself off, safely</p>

With the trunk working, on SW2:

```cisco
interface GigabitEthernet1/0/24
 switchport trunk allowed vlan 10
```

<div class="lab-watch"><b>Things to notice</b>
VLANs 20 and 999 are gone from the trunk instantly, because that command <b>replaced</b> the list rather than adding to it. If your management VLAN had been on that trunk you would have just lost the switch — this is the single most common way an engineer disconnects themselves mid-change. Recover with <code>switchport trunk allowed vlan add 20,999</code> and commit the word <code>add</code> to memory.</div>

<div class="lab-earned"><b>What you earned</b>
You can find an 802.1Q tag in a hex dump without help, and you know that capturing on a SPAN port without <code>encapsulation replicate</code> hides it — which stops a whole class of false conclusions. You have seen a native VLAN mismatch bridge two broadcast domains while every link stayed up and every monitoring system stayed green, so "nothing is down" will never again mean "nothing is wrong". You have watched a laptop negotiate itself a trunk, which is the only argument for <code>nonegotiate</code> anybody ever needs. And you know why <code>allowed vlan</code> without <code>add</code> is the command to type slowly.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Where in the frame is the 802.1Q tag inserted?</p>
<label class="qz-opt"><input type="radio" name="dqz1"><span>At the very start, before the destination MAC</span><em class="qz-fb qz-bad">Switches must read the destination MAC first to forward at all — nothing may come before it.</em></label>
<label class="qz-opt"><input type="radio" name="dqz1"><span>Immediately after the source MAC, where the EtherType was</span><em class="qz-fb qz-good">Correct — <code>0x8100</code> takes the EtherType's place at offset 12 and the real EtherType moves four bytes to the right.</em></label>
<label class="qz-opt"><input type="radio" name="dqz1"><span>Inside the IP header</span><em class="qz-fb qz-bad">The tag is Layer 2. The IP packet is not modified at all — you can verify that by comparing checksums before and after.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Both ends of a link are <code>switchport mode dynamic auto</code>. What is the result?</p>
<label class="qz-opt"><input type="radio" name="dqz2"><span>A trunk forms</span><em class="qz-fb qz-bad">Neither end initiates in auto mode, so the conversation never starts.</em></label>
<label class="qz-opt"><input type="radio" name="dqz2"><span>The link stays an access port, with no error</span><em class="qz-fb qz-good">Right. Auto is passive at both ends. The interface is up, nothing is logged, and the trunk you expected simply is not there.</em></label>
<label class="qz-opt"><input type="radio" name="dqz2"><span>The link goes down</span><em class="qz-fb qz-bad">DTP never takes a link down. That is precisely what makes this fault slow to find.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>SW1's trunk has native VLAN 1, SW2's has native VLAN 99. What happens?</p>
<label class="qz-opt"><input type="radio" name="dqz3"><span>The trunk fails and the link goes down</span><em class="qz-fb qz-bad">On most platforms the trunk stays up. That is the problem.</em></label>
<label class="qz-opt"><input type="radio" name="dqz3"><span>VLAN 1 and VLAN 99 are bridged into one broadcast domain</span><em class="qz-fb qz-good">Exactly. Untagged frames from one side are filed into the other side's native VLAN. Nothing goes down, and CDP is the only thing that complains.</em></label>
<label class="qz-opt"><input type="radio" name="dqz3"><span>Untagged traffic is dropped</span><em class="qz-fb qz-bad">It is not dropped — it is delivered, into the wrong VLAN, which is considerably worse.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>You capture on a SPAN destination and see no VLAN tags on traffic you know crossed a trunk. Most likely reason?</p>
<label class="qz-opt"><input type="radio" name="dqz4"><span>The SPAN session lacks <code>encapsulation replicate</code></span><em class="qz-fb qz-good">Correct — by default the destination port rewrites the frames as it sends them, stripping the tag. This one detail has generated a lot of wrong conclusions.</em></label>
<label class="qz-opt"><input type="radio" name="dqz4"><span>The trunk is not actually tagging</span><em class="qz-fb qz-bad">Possible, but check the capture configuration before you accuse the trunk.</em></label>
<label class="qz-opt"><input type="radio" name="dqz4"><span>Wireshark hides 802.1Q headers by default</span><em class="qz-fb qz-bad">It does not — it decodes them prominently.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What does <code>switchport trunk allowed vlan 40</code> do to a trunk currently allowing 10, 20 and 30?</p>
<label class="qz-opt"><input type="radio" name="dqz5"><span>Adds 40 to the list</span><em class="qz-fb qz-bad">That is <code>allowed vlan <b>add</b> 40</code>. The word matters more than any other word on this page.</em></label>
<label class="qz-opt"><input type="radio" name="dqz5"><span>Replaces the list — only VLAN 40 is allowed</span><em class="qz-fb qz-good">Correct, and 10, 20 and 30 stop crossing the trunk immediately. If your management VLAN was one of them, the session you typed it in ends here.</em></label>
<label class="qz-opt"><input type="radio" name="dqz5"><span>Nothing, until you also create VLAN 40</span><em class="qz-fb qz-bad">The allowed list is independent of whether the VLAN exists. It applies at once.</em></label>
</div>

---

## References

- **IEEE 802.1Q** — the VLAN tagging standard; the tag format, TPID and TCI come from it. Now folded into the consolidated 802.1Q-2022.
- Cisco — [Inter-Switch Link and IEEE 802.1Q Frame Format](https://www.cisco.com/c/en/us/support/docs/lan-switching/8021q/17056-741-4.html)
- Cisco — [VLAN Security White Paper](https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-6500-series-switches/white_paper_c11_655395.html) — the original analysis of switch spoofing and double tagging.
- Cisco — [Configuring VLAN Trunks](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/vlan/b_173_vlan_9300_cg/configuring_vlan_trunks.html)
- Cisco — [Configuring SPAN and RSPAN](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/nmgmt/b_173_nmgmt_9300_cg/configuring_span_and_rspan.html) — where `encapsulation replicate` is documented.

---

*Next in ENCOR 3.1: [EtherChannel — LACP, PAgP, and why your bundle has one member](/blog/etherchannel-lacp-pagp-and-load-balancing-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
