---
title: "SPAN, RSPAN and ERSPAN: Getting a Copy of Traffic Without Being in the Path"
excerpt: "Port mirroring is the only way to see traffic you are not carrying, and it is full of quiet traps. The destination port stops being a normal port, tags disappear unless you ask for them, mirroring two gigabit ports into one drops frames with no counter that says so, and ERSPAN adds 36 bytes to every copied frame across a network that was not expecting them."
date: "2026-09-25"
tags: ["SPAN", "RSPAN", "ERSPAN", "Packet Capture", "Troubleshooting", "ENCOR"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 4.3 *Configure SPAN/RSPAN/ERSPAN*.

## Cheat sheet

| | **SPAN** | **RSPAN** | **ERSPAN** |
|---|---|---|---|
| **Scope** | One switch | Across a **Layer 2** domain | Across a **routed** network |
| **Transport** | Internal | A dedicated **RSPAN VLAN** | **GRE**, protocol 47 |
| **Needs** | Nothing | `remote-span` VLAN on every switch between | IP reachability, an L3 source |
| **Overhead** | None | A VLAN carried on trunks | **36 bytes** per frame |
| **Sessions** | Typically **2** local | Source + destination sessions | Source + destination sessions |

| | |
|---|---|
| **Direction** | `rx` · `tx` · `both` (default) |
| **Destination port** | Stops forwarding normally, **leaves spanning tree**, ignores incoming traffic |
| **VLAN tags** | **Stripped by default** — needs `encapsulation replicate` |
| **Oversubscription** | Frames are dropped **silently**. There is no counter for it |
| **ERSPAN GRE type** | **`0x88BE`** (Type II) |

**The one people lose an afternoon to.** A SPAN destination port **strips VLAN tags by default**. Capture on it, see no 802.1Q header, and conclude the trunk is not tagging — when in fact the switch removed the tag on the way out. `encapsulation replicate` is the fix, and it is not the default.

---

## Three ways to get a copy

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 265" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SPAN copies within one switch, RSPAN carries copies over a dedicated VLAN, ERSPAN wraps copies in GRE across a routed network">
  <style>.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.05em}.sv1 .l{stroke:#8A8A93;stroke-width:1.5}.sv1 .c{stroke:#4b7bec;stroke-width:2.5;fill:none}
  </style>
  <text class="k" x="14" y="18" fill="#2b5ab8">SPAN — one switch</text>
  <rect class="n" x="120" y="26" width="70" height="28" rx="3"/><text class="nt" x="155" y="45" text-anchor="middle">SW</text>
  <rect class="n" x="14" y="26" width="70" height="28" rx="3"/><text class="nt" x="49" y="45" text-anchor="middle">source</text>
  <rect class="n" x="226" y="26" width="86" height="28" rx="3"/><text class="nt" x="269" y="45" text-anchor="middle">capture PC</text>
  <line class="l" x1="84" y1="40" x2="120" y2="40"/>
  <path class="c" d="M 190 40 L 226 40"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 190 40 L 226 40"/></circle>
  <text class="s" x="330" y="44">no transport at all — the switch copies internally</text>
  <text class="k" x="14" y="92" fill="#0f6b47">RSPAN — across a Layer 2 domain</text>
  <rect class="n" x="14" y="100" width="70" height="28" rx="3"/><text class="nt" x="49" y="119" text-anchor="middle">SW1</text>
  <rect class="n" x="186" y="100" width="70" height="28" rx="3"/><text class="nt" x="221" y="119" text-anchor="middle">SW2</text>
  <rect class="n" x="358" y="100" width="86" height="28" rx="3"/><text class="nt" x="401" y="119" text-anchor="middle">capture PC</text>
  <path class="c" d="M 84 114 L 186 114"/>
  <path class="c" d="M 256 114 L 358 114"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="2s" repeatCount="indefinite" path="M 84 114 L 358 114"/></circle>
  <text class="s" x="135" y="106" text-anchor="middle" fill="#0f6b47">RSPAN VLAN 999</text>
  <text class="s" x="464" y="118">every trunk in between must carry that VLAN</text>
  <text class="k" x="14" y="166" fill="#B26014">ERSPAN — across a routed network</text>
  <rect class="n" x="14" y="174" width="70" height="28" rx="3"/><text class="nt" x="49" y="193" text-anchor="middle">SW1</text>
  <rect class="n" x="186" y="174" width="70" height="28" rx="3"/><text class="nt" x="221" y="193" text-anchor="middle">R</text>
  <rect class="n" x="358" y="174" width="86" height="28" rx="3"/><text class="nt" x="401" y="193" text-anchor="middle">collector</text>
  <path class="c" d="M 84 188 L 186 188" stroke="#F2994A"/>
  <path class="c" d="M 256 188 L 358 188" stroke="#F2994A"/>
  <circle r="4" fill="#F2994A"><animateMotion dur="2s" repeatCount="indefinite" path="M 84 188 L 358 188"/></circle>
  <text class="s" x="220" y="180" text-anchor="middle" fill="#B26014">GRE · proto 47</text>
  <text class="s" x="464" y="192">routed anywhere — at 36 bytes of overhead per frame</text>
  <rect x="14" y="216" width="612" height="40" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="s" x="26" y="236" font-weight="700" fill="#17171A">In all three cases:</text>
  <text class="s" x="120" y="236">the copy is exactly that — a copy. The original is forwarded normally and the</text>
  <text class="s" x="26" y="250">sender never knows. That is what makes mirroring safe to enable on production traffic.</text>
</svg>
<figcaption><b>Figure 1.</b> The same idea at three scopes. Choose by where the analyser is, not by preference — and remember only ERSPAN's copies cross a router.</figcaption>
</figure>

<div class="why">
<b>Why the destination port changes personality</b>
A SPAN destination is no longer a normal switch port. It <b>stops participating in spanning tree</b>, it does not learn MAC addresses, and by default it <b>discards anything the attached device sends into it</b>. That last behaviour is deliberate — it stops your analyser injecting traffic into the network — and it is why plugging a laptop into a SPAN destination and expecting it to also have network access does not work. If you need both, you need <code>ingress</code> on the destination, or a second NIC.
</div>

<div class="walk">
<div class="walk-head">What happens to a mirrored frame <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="spw" id="sp1" checked><label for="sp1"><span class="step-n">1</span>The copy</label>
  <input type="radio" name="spw" id="sp2"><label for="sp2"><span class="step-n">2</span>Tags vanish</label>
  <input type="radio" name="spw" id="sp3"><label for="sp3"><span class="step-n">3</span>ERSPAN wraps it</label>
  <input type="radio" name="spw" id="sp4"><label for="sp4"><span class="step-n">4</span>Oversubscription</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A mirrored copy is made after the forwarding decision and does not affect the original frame">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <rect class="n" x="20" y="58" width="80" height="32" rx="3"/><text class="nt" x="60" y="79" text-anchor="middle">SOURCE</text>
  <rect class="n" x="270" y="58" width="90" height="32" rx="3"/><text class="nt" x="315" y="79" text-anchor="middle">SWITCH</text>
  <rect class="n" x="540" y="20" width="84" height="32" rx="3"/><text class="nt" x="582" y="41" text-anchor="middle">DEST</text>
  <rect class="n" x="540" y="104" width="84" height="32" rx="3"/><text class="nt" x="582" y="125" text-anchor="middle">ANALYSER</text>
  <path d="M 100 74 L 270 74" stroke="#8A8A93" stroke-width="2" fill="none"/>
  <path d="M 360 68 L 540 40" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <path d="M 360 82 L 540 118" stroke="#4b7bec" stroke-width="2" stroke-dasharray="5 4" fill="none"/>
  <circle r="4" fill="#8A8A93"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 100 74 L 270 74"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.6s" repeatCount="indefinite" path="M 360 68 L 540 40"/></circle>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" begin="0.6s" repeatCount="indefinite" path="M 360 82 L 540 118"/></circle>
  <text class="s" x="452" y="30" fill="#0f6b47">the real frame, untouched</text>
  <text class="s" x="452" y="150" fill="#4b7bec">a copy, best effort</text>
  <text class="k" x="14" y="172">The copy is exactly that — the original is forwarded as if SPAN were not configured.</text>
</svg>
<p class="walk-say"><span class="walk-title">A copy, not a diversion</span>
The switch replicates the frame to the destination port and forwards the original normally. Nothing about the production path changes, which is why mirroring is safe to turn on during an incident.
<br><br>What you do <b>not</b> get is any guarantee about the copy. Mirroring is best effort — the original is the switch's job, the copy is a favour.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="By default the mirrored copy has its VLAN tag stripped which makes trunk traffic look untagged to the analyser">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv3 .tag{fill:rgba(211,0,45,.14);stroke:#D3002D}.sv3 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">ON THE WIRE</text>
  <rect class="f" x="14" y="30" width="110" height="28"/><text class="m" x="69" y="49" text-anchor="middle">dst / src</text>
  <rect class="tag" x="128" y="30" width="120" height="28"/><text class="m" x="188" y="49" text-anchor="middle">802.1Q vlan 10</text>
  <rect class="f" x="252" y="30" width="374" height="28"/><text class="m" x="439" y="49" text-anchor="middle">type + payload</text>
  <text class="hdr" x="14" y="88">WHAT THE ANALYSER SEES (default)</text>
  <rect class="f" x="14" y="98" width="110" height="28"/><text class="m" x="69" y="117" text-anchor="middle">dst / src</text>
  <rect x="128" y="98" width="120" height="28" fill="none" stroke="#D3002D" stroke-dasharray="4 3"/>
  <text class="m" x="188" y="117" text-anchor="middle" fill="#B80027">gone</text>
  <rect class="f" x="252" y="98" width="374" height="28"/><text class="m" x="439" y="117" text-anchor="middle">type + payload</text>
  <text class="k" x="14" y="152" fill="#B80027">Trunk traffic arrives looking untagged — and people misdiagnose trunking because of it.</text>
  <text class="s" x="14" y="172">Add <tspan font-family="ui-monospace,Menlo,monospace">encapsulation replicate</tspan> to the session to keep the tag.</text>
</svg>
<p class="walk-say"><span class="walk-title">The tag is stripped unless you ask</span>
By default a SPAN destination sends the frame <b>without its 802.1Q tag</b>. Mirror a trunk and every VLAN's traffic arrives looking like one flat untagged stream, which is exactly what a broken trunk would look like.
<br><br><code>monitor session 1 destination interface Gi1/0/24 encapsulation replicate</code> preserves the original encapsulation. Turn it on any time the source is a trunk, or you will spend an afternoon proving a trunking fault that does not exist.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ERSPAN wraps the whole original frame in an ERSPAN header GRE and an outer IP header adding thirty six bytes">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .o{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv4 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">ERSPAN TYPE II ON THE WIRE</text>
  <rect class="o" x="14" y="32" width="120" height="30"/><text class="m" x="74" y="52" text-anchor="middle">outer IP · 47</text>
  <rect class="o" x="138" y="32" width="96" height="30"/><text class="m" x="186" y="52" text-anchor="middle">GRE 88be</text>
  <rect class="o" x="238" y="32" width="112" height="30"/><text class="m" x="294" y="52" text-anchor="middle">ERSPAN hdr</text>
  <rect class="f" x="354" y="32" width="272" height="30"/><text class="m" x="490" y="52" text-anchor="middle">the complete original frame</text>
  <text class="s" x="74" y="78" text-anchor="middle">20 bytes</text>
  <text class="s" x="186" y="78" text-anchor="middle">8 bytes</text>
  <text class="s" x="294" y="78" text-anchor="middle">8 bytes · vlan + session</text>
  <text class="s" x="490" y="78" text-anchor="middle">untouched, tag and all</text>
  <rect x="14" y="98" width="612" height="34" fill="rgba(211,0,45,.10)" stroke="#D3002D"/>
  <text class="k" x="26" y="120" fill="#B80027">36 bytes of overhead per mirrored frame — against the path MTU.</text>
  <text class="k" x="14" y="158">A 1500-byte frame becomes 1536 and the transit path fragments or drops it.</text>
  <text class="s" x="14" y="180">Raise MTU on the path, or accept truncated captures. This is the ERSPAN deployment problem.</text>
</svg>
<p class="walk-say"><span class="walk-title">The original frame, nested whole</span>
ERSPAN wraps the entire Layer 2 frame — destination MAC, source MAC, VLAN tag, everything — inside an <b>8-byte ERSPAN header</b> carrying the original VLAN and the session ID, then <b>GRE with protocol type 0x88BE</b>, then an <b>outer IP header with protocol 47</b>.
<br><br>That is <b>36 bytes of overhead on every mirrored frame</b>, and it is charged against the MTU of the path to the analyser. Mirror full-size frames across a standard 1500-byte path and they exceed it. Raise the MTU end to end, or expect to lose the largest and often most interesting frames.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mirroring more traffic than the destination port can carry silently discards frames with no counter">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect class="n" x="20" y="34" width="86" height="26" rx="3"/><text class="nt" x="63" y="52" text-anchor="middle">src 1G</text>
  <rect class="n" x="20" y="70" width="86" height="26" rx="3"/><text class="nt" x="63" y="88" text-anchor="middle">src 1G</text>
  <rect class="n" x="20" y="106" width="86" height="26" rx="3"/><text class="nt" x="63" y="124" text-anchor="middle">src 1G</text>
  <path d="M 106 47 L 300 83" stroke="#8A8A93" stroke-width="1.5" fill="none"/>
  <path d="M 106 83 L 300 83" stroke="#8A8A93" stroke-width="1.5" fill="none"/>
  <path d="M 106 119 L 300 83" stroke="#8A8A93" stroke-width="1.5" fill="none"/>
  <rect class="n" x="300" y="68" width="110" height="30" rx="3"/><text class="nt" x="355" y="88" text-anchor="middle">dst 1G</text>
  <path d="M 410 83 L 560 83" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 410 83 L 560 83"/></circle>
  <text class="s" x="200" y="150" text-anchor="middle">3 Gbps of copies</text>
  <text class="s" x="480" y="70" text-anchor="middle" fill="#4b7bec">1 Gbps out</text>
  <text class="k" x="14" y="178" fill="#B80027">The excess is discarded — and no counter anywhere records it.</text>
</svg>
<p class="walk-say"><span class="walk-title">The silent failure</span>
Mirror three gigabit sources to one gigabit destination and the switch discards whatever will not fit. There is <b>no drop counter</b> for this on most platforms, so your capture is simply incomplete and looks complete.
<br><br>This is how a mirrored capture "proves" a packet was never sent when it was. Size the destination above the aggregate of the sources, or filter the session down — and when a capture shows an unexplained absence, suspect the mirror before you suspect the network.</p>
</div>
</div>
</div>
---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! LOCAL SPAN</span>
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">source interface</span> <span class="opt">GigabitEthernet1/0/5</span> <span class="opt">both</span>
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">source vlan</span> <span class="opt">10</span> <span class="t">rx</span>
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">filter vlan</span> <span class="opt">10,20</span>
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">destination interface</span> <span class="opt">Gi1/0/48</span> <span class="t">encapsulation replicate ingress vlan</span> <span class="opt">10</span></div>
<dl class="cmd-parts">
<div><dt>source interface … both</dt><dd><code>rx</code>, <code>tx</code> or <code>both</code> — and <b><code>both</code> is the default</b>, which means a full-duplex gigabit port can generate up to two gigabits of mirrored traffic. That matters for the next entry.</dd></div>
<div><dt>source vlan 10 rx</dt><dd>Mirror an entire VLAN rather than a port. Note that <b>VLAN sources support <code>rx</code> only</b> on many platforms, because a frame leaving the VLAN would otherwise be copied several times. Also note you cannot mix interface and VLAN sources in one session on most hardware.</dd></div>
<div class="is-key"><dt>filter vlan 10,20</dt><dd>When the source is a <b>trunk</b>, this restricts the copy to specific VLANs. Without it you mirror everything crossing that trunk, which on an uplink is the entire switch's traffic — and straight into the oversubscription problem below.</dd></div>
<div class="is-key"><dt>encapsulation replicate</dt><dd><b>The single most important keyword here.</b> Without it the destination port rewrites frames as it sends them and <b>strips the 802.1Q tag</b>. You capture a trunk, see no VLAN tags, and conclude the trunk is broken. With it, frames are copied as they were — tags, CDP, BPDUs and all.</dd></div>
<div><dt>ingress vlan 10</dt><dd>Allows the attached device to <em>send</em> into the network, placed in VLAN 10. Off by default. Enable it only if you need the analyser reachable, and understand you have just given it a way onto the network.</dd></div>
<div class="is-key"><dt><span class="opt">session limits</span></dt><dd>Most Catalyst platforms support only <b>two local SPAN sessions</b>. Configure a third and it is rejected — and existing sessions belonging to features you forgot about (like a wireless or IDS integration) count toward the limit. <code>show monitor</code> before you build.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! RSPAN — source switch</span>
<span class="t">vlan</span> <span class="opt">999</span>
 <span class="t">remote-span</span>
!
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">source interface</span> <span class="opt">Gi1/0/5</span>
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">destination remote vlan</span> <span class="opt">999</span>
!
<span class="opt">! RSPAN — destination switch</span>
<span class="t">monitor session</span> <span class="opt">2</span> <span class="t">source remote vlan</span> <span class="opt">999</span>
<span class="t">monitor session</span> <span class="opt">2</span> <span class="t">destination interface</span> <span class="opt">Gi1/0/48</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>vlan 999 / remote-span</dt><dd>Marks the VLAN as carrying mirrored traffic. <b>This must be configured on every switch the VLAN traverses</b>, not just the two ends — an intermediate switch without it treats the VLAN as ordinary and will learn MACs from the copied frames, which pollutes its tables with addresses that do not live there.</dd></div>
<div><dt>destination remote vlan</dt><dd>On the source switch the "destination" is the RSPAN VLAN itself. Two sessions are always needed: one to get traffic into the VLAN, one to get it out.</dd></div>
<div class="is-key"><dt><span class="opt">the trunk</span></dt><dd>VLAN 999 must be <b>allowed on every trunk in the path</b>. This is the commonest RSPAN failure and it looks exactly like a broken session — <code>show monitor</code> is perfect at both ends and no traffic arrives. <code>show interfaces trunk</code> on each hop finds it.</dd></div>
<div><dt><span class="opt">what it costs</span></dt><dd>Mirrored traffic now consumes bandwidth on <b>every trunk between the two switches</b>, in addition to the real traffic. A busy source port can saturate an uplink that was previously comfortable.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! ERSPAN — source</span>
<span class="t">monitor session</span> <span class="opt">1</span> <span class="t">type erspan-source</span>
 <span class="t">source interface</span> <span class="opt">Gi1/0/5</span>
 <span class="t">no shutdown</span>
 <span class="t">destination</span>
  <span class="t">erspan-id</span> <span class="opt">7</span>
  <span class="t">ip address</span> <span class="opt">10.0.0.70</span>
  <span class="t">origin ip address</span> <span class="opt">10.0.0.1</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>no shutdown</dt><dd><b>ERSPAN sessions are created shut down.</b> Build the whole thing, forget this line, and nothing happens — with a configuration that reads as complete. It catches almost everyone once.</dd></div>
<div><dt>erspan-id 7</dt><dd>A session identifier carried in the ERSPAN header, so a collector receiving several streams can tell them apart. <b>Must match</b> between the source and destination sessions.</dd></div>
<div><dt>ip address / origin ip</dt><dd>The GRE tunnel endpoints. <code>origin</code> should be a loopback so the stream survives a link failover and always arrives from the same address.</dd></div>
<div class="is-key"><dt><span class="opt">the MTU problem</span></dt><dd>ERSPAN adds <b>36 bytes</b> — 20 IP, 8 GRE, 8 ERSPAN. A full-size 1518-byte frame becomes 1554 and <b>will be fragmented or dropped</b> on a path expecting 1500. Raise the MTU across the path, or accept that your captures lose exactly the large frames you most wanted to see.</dd></div>
</dl>
</div>

### ERSPAN on the wire

<div class="cap">
<div class="cap-head">Capture · ERSPAN Type II arriving at the collector <span class="cap-filter">ip.proto == 47</span></div>
<div class="cap-hex"><pre>0000  00 de ad be ef 01 00 1a  2b 3c 4d 5e 08 00 45 00   ........+&lt;M^..E.
0010  00 5a 7a 1c 00 00 40 <mark>2f</mark>  ec 12 0a 00 00 01 0a 00   .Zz...@/........
0020  00 46 10 00 <mark>88 be</mark> 00 00  00 05 <mark>10 0a</mark> <mark>00 07</mark> 00 00   .F..............
0030  00 00 <mark>00 11 22 33 44 55</mark>  00 aa bb cc dd ee 08 00   ...."3DU........
0040  45 00 00 28 11 11 00 00  40 06 93 82 0a 01 0a 32   E..(....@......2</pre></div>
<div class="cap-note"><b>Three layers, and you can see all of them.</b> <code>2f</code> — protocol <b>47, GRE</b>. <code>88 be</code> — the GRE protocol type that identifies this as <b>ERSPAN Type II</b>. Then the 8-byte ERSPAN header: <code>10 0a</code> decodes as version 1 and <b>VLAN 10</b>, and <code>00 07</code> carries the <b>session ID 7</b> you configured.
<br><br>And at offset 0x34 the <b>original Ethernet frame begins</b> — <code>00 11 22 33 44 55</code> is the destination MAC of the mirrored traffic, complete with its own EtherType and IP header. That is the whole point: you get the frame as it was, not a summary of it.
<br><br>Count the overhead: 20 + 8 + 8 = <b>36 bytes</b> in front of every single copied frame. On a busy source port that is not a rounding error on your WAN link.</div>
</div>

<div class="warn">
<b>Oversubscription drops frames and does not tell you</b>
Mirror two gigabit ports, both directions, into one gigabit destination and you have asked for up to <b>4 Gbps</b> of copy into a 1 Gbps port. The switch drops the excess — and on most platforms there is <b>no counter that reports it</b>. Your capture is quietly incomplete, and the packets missing are the ones from the busiest moments, which is exactly when you were looking.
<br><br>Symptoms that should make you suspect it: TCP retransmissions in the capture that the endpoints do not actually see, gaps in sequence numbers, or an analyser reporting loss on a link that has no errors. The fixes are a faster destination port, <code>filter vlan</code>, mirroring one direction only, or a proper TAP.
</div>

---

## Verifying it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — two commands, and one of them catches the classic mistake</div>
<pre><span class="p">SW1#</span> <span class="c">show monitor session 1</span>
Session 1
---------
Type                   : Local Session
Source Ports           :
    Both               : Gi1/0/5
Destination Ports      : Gi1/0/48
    Encapsulation      : <span class="y">Replicate</span>          <span class="o">&lt;- tags preserved. Without this, stripped.</span>
          Ingress      : Disabled

<span class="p">SW1#</span> <span class="c">show monitor</span>
Session 1 : Local Session
Session 2 : Remote Source Session
<span class="o">! Two sessions used. On most Catalyst platforms that is the local SPAN limit —</span>
<span class="o">! a third will be rejected.</span>

<span class="p">SW1#</span> <span class="c">show monitor session 1 type erspan-source</span>
Session 1
---------
Type                   : ERSPAN Source Session
<span class="r">Status                 : Admin Disabled</span>       <span class="o">&lt;- the missing "no shutdown"</span>
Destination IP Address : 10.0.0.70
ERSPAN ID              : 7
Origin IP Address      : 10.0.0.1

<span class="p">SW1#</span> <span class="c">show interfaces Gi1/0/48</span>
GigabitEthernet1/0/48 is up, line protocol is up
  <span class="y">Port is a SPAN destination</span>
     0 packets input, 0 bytes              <span class="o">&lt;- input is ignored by design</span>
     8841203 packets output<span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>Admin Disabled</code> on an ERSPAN session is the single most common ERSPAN fault</b>, and the output says it plainly once you know to look. For local SPAN, the line to check is <code>Encapsulation: Replicate</code> — if it says anything else, your capture has no VLAN tags and you are about to misdiagnose something.</p>

<div class="real">
<b>In the real world</b>
The mistake that wastes a whole troubleshooting session is capturing on a SPAN destination without <code>encapsulation replicate</code>, then concluding the trunk is not tagging, the voice VLAN is misconfigured, or QoS marking has been stripped. None of it is true — the <b>SPAN destination</b> removed the tag on the way out, after the switch had already done everything correctly.
<br><br>Make it a habit: the moment you build a SPAN session for trunk analysis, add <code>encapsulation replicate</code>, and check <code>show monitor</code> confirms it before you trust a single frame in the capture.
</div>

---

## What goes wrong

**No traffic at the analyser, session looks perfect.** ERSPAN session is `shutdown`, or the RSPAN VLAN is not allowed on a trunk in the path.

**Capture shows no VLAN tags on a trunk.** `encapsulation replicate` is missing.

**A third session is rejected.** Platform session limit, usually two for local SPAN.

**Frames are missing under load.** Oversubscription. No counter will tell you.

**The analyser cannot reach the network.** Correct — a SPAN destination ignores incoming traffic unless `ingress` is enabled.

**ERSPAN traffic is fragmented or large frames are missing.** 36 bytes of overhead against a 1500-byte path MTU.

**Intermediate switches learn strange MAC addresses.** The RSPAN VLAN is not marked `remote-span` on every switch it crosses.

---

<div class="lab">
<div class="lab-head">Lab — mirror a trunk, lose the tags, then get them back</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build all three session types and capture real traffic from each. Produce the tag-stripping fault deliberately so you never misdiagnose it. Hit the session limit, forget the ERSPAN <code>no shutdown</code>, and drop frames through oversubscription — then measure the loss and prove the capture was incomplete.</div>

**Topology.** Two switches with a trunk between them, a router for the ERSPAN path, a host generating traffic on VLAN 10, and a capture machine.

<p class="lab-step"><span class="n">1</span>Local SPAN, and lose the tags</p>

```cisco
monitor session 1 source interface Gi1/0/24
monitor session 1 destination interface Gi1/0/48
```

Capture on the destination while VLAN 10 traffic crosses the trunk at Gi1/0/24.

<div class="lab-watch"><b>Things to notice</b>
<b>No 802.1Q headers anywhere</b>, even though you are mirroring a trunk that is definitely tagging. Confirm with <code>show interfaces trunk</code> that the trunk is genuinely carrying VLAN 10.
<br><br>Now add <code>encapsulation replicate</code> to the destination line and capture again — the tags appear. You have just produced and fixed the fault that sends people looking for a trunking problem that does not exist.</div>

<p class="lab-step"><span class="n">2</span>Hit the session limit</p>

Build a second local session, then try a third.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The third is accepted</b> — your platform supports more. Note the actual number; it varies and the documentation for your specific model is the only authority.</li>
<li><b>The second is rejected</b> — something else already has a session. <code>show monitor</code> lists them all, including ones created by other features.</li>
<li><b>The error message is unhelpful</b> — that is typical. <code>show monitor</code> before building is faster than reading it.</li>
</ul></div>

<p class="lab-step"><span class="n">3</span>RSPAN across the trunk, and break it once</p>

```cisco
! both switches
vlan 999
 remote-span
```

Build the source session on SW1 and the destination session on SW2. Then **remove VLAN 999 from the trunk's allowed list** and observe.

<div class="lab-watch"><b>Things to notice</b>
<code>show monitor</code> is <b>perfect at both ends</b> and no traffic arrives. Nothing indicates the fault. <code>show interfaces trunk</code> on the link between them shows VLAN 999 missing from the allowed list.
<br><br>That combination — correct sessions, zero traffic — should send you straight to the trunk rather than to the session configuration. Restore it with <code>switchport trunk allowed vlan add 999</code> and watch traffic appear immediately.</div>

<p class="lab-step"><span class="n">4</span>ERSPAN, and forget the one line</p>

Build an ERSPAN source session to a collector across the router, deliberately omitting `no shutdown`.

<div class="lab-watch"><b>Things to notice</b>
Nothing arrives, and the configuration looks complete. <code>show monitor session 1 type erspan-source</code> says <b><code>Admin Disabled</code></b> — the answer, in the output, if you look.
<br><br>Add <code>no shutdown</code>, then capture at the collector and find a GRE packet with protocol type <code>88 be</code>. Expand it until you reach the <b>original Ethernet frame</b> nested inside and confirm the inner MACs are the mirrored hosts, not the routers.</div>

<p class="lab-step"><span class="n">5</span>Measure ERSPAN's overhead against MTU</p>

Send full-size 1500-byte frames through the mirrored port and watch the collector.

<div class="lab-watch"><b>Things to notice</b>
The encapsulated copies are <b>1554 bytes</b> and either fragment or disappear on a 1500-byte path — so the frames missing from your capture are precisely the large ones. Compare packet counts at the source and the collector to quantify it.
<br><br>Raise the MTU along the path and repeat. This is why ERSPAN across a WAN needs planning rather than just IP reachability.</div>

<p class="lab-step"><span class="n">6</span>Oversubscribe it deliberately</p>

Mirror two busy gigabit ports, `both` directions, into one gigabit destination, and generate enough traffic to exceed it.

<div class="lab-watch"><b>Things to notice</b>
Compare the packet count the hosts actually sent with the count in your capture — the difference is silent loss. Then look for a drop counter anywhere on the switch and find nothing that attributes it.
<br><br>Fix it three ways and compare: <code>rx</code> only instead of <code>both</code>, a <code>filter vlan</code> to narrow the copy, and a 10-gig destination. <b>Knowing your capture can be incomplete, with no indication, changes how much you trust it</b> — which is the most valuable thing in this lab.</div>

<div class="lab-earned"><b>What you earned</b>
You will never again conclude a trunk is not tagging because a SPAN capture shows no tags. You know that a perfect-looking RSPAN session with no traffic means the VLAN is missing from a trunk, and that an ERSPAN session that does nothing is almost certainly still shut. You can read an ERSPAN frame down to the original Ethernet header inside it, and you know it costs 36 bytes that your path MTU may not have room for. And you have measured silent oversubscription loss, so you know when a capture deserves to be trusted.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>You capture on a SPAN destination mirroring a trunk and see no 802.1Q tags. Why?</p>
<label class="qz-opt"><input type="radio" name="spq1"><span>The destination port strips tags unless <code>encapsulation replicate</code> is configured</span><em class="qz-fb qz-good">Correct — the switch rewrites frames as it sends them out the destination. The trunk is tagging perfectly.</em></label>
<label class="qz-opt"><input type="radio" name="spq1"><span>The trunk is not actually tagging</span><em class="qz-fb qz-bad">Check <code>show interfaces trunk</code> — it almost certainly is. Suspect the SPAN session first.</em></label>
<label class="qz-opt"><input type="radio" name="spq1"><span>Wireshark hides them</span><em class="qz-fb qz-bad">Wireshark decodes 802.1Q prominently.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>What does RSPAN need that local SPAN does not?</p>
<label class="qz-opt"><input type="radio" name="spq2"><span>A VLAN marked <code>remote-span</code>, allowed on every trunk in the path</span><em class="qz-fb qz-good">Correct, and the trunk allowed-list is the commonest failure — the sessions look perfect and nothing arrives.</em></label>
<label class="qz-opt"><input type="radio" name="spq2"><span>GRE tunnels between the switches</span><em class="qz-fb qz-bad">That is ERSPAN. RSPAN stays at Layer 2.</em></label>
<label class="qz-opt"><input type="radio" name="spq2"><span>An IP address on the destination port</span><em class="qz-fb qz-bad">A SPAN destination is not addressed at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>An ERSPAN session is fully configured and nothing arrives. First thing to check?</p>
<label class="qz-opt"><input type="radio" name="spq3"><span>Whether the session is administratively shut — ERSPAN sessions are created shutdown</span><em class="qz-fb qz-good">Correct. <code>show monitor session N type erspan-source</code> says <code>Admin Disabled</code>, and the fix is <code>no shutdown</code> inside the session.</em></label>
<label class="qz-opt"><input type="radio" name="spq3"><span>The RSPAN VLAN</span><em class="qz-fb qz-bad">ERSPAN does not use one.</em></label>
<label class="qz-opt"><input type="radio" name="spq3"><span>Whether GRE is permitted end to end</span><em class="qz-fb qz-bad">Worth checking second — but check the shutdown first, it costs five seconds.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>How much overhead does ERSPAN Type II add per frame?</p>
<label class="qz-opt"><input type="radio" name="spq4"><span>36 bytes — 20 IP, 8 GRE, 8 ERSPAN</span><em class="qz-fb qz-good">Correct, which turns a 1518-byte frame into 1554 and breaks it on a 1500-byte path.</em></label>
<label class="qz-opt"><input type="radio" name="spq4"><span>24 bytes, like plain GRE</span><em class="qz-fb qz-bad">That omits the 8-byte ERSPAN header and the sequence field.</em></label>
<label class="qz-opt"><input type="radio" name="spq4"><span>None — the frame is sent unchanged</span><em class="qz-fb qz-bad">It is encapsulated, which is how it crosses a router at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>You mirror two gigabit ports in both directions into one gigabit destination. What happens?</p>
<label class="qz-opt"><input type="radio" name="spq5"><span>Frames are dropped silently, with no counter reporting it</span><em class="qz-fb qz-good">Correct — up to 4 Gbps of copy into a 1 Gbps port. Your capture is incomplete exactly during the busy periods you were investigating.</em></label>
<label class="qz-opt"><input type="radio" name="spq5"><span>The switch rate-limits the source ports</span><em class="qz-fb qz-bad">Production traffic is never affected by mirroring — only the copy is dropped.</em></label>
<label class="qz-opt"><input type="radio" name="spq5"><span>The session is rejected at configuration time</span><em class="qz-fb qz-bad">It is accepted without warning.</em></label>
</div>

---

## References

- Cisco — [Configuring SPAN and RSPAN](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/nmgmt/b_173_nmgmt_9300_cg/configuring_span_and_rspan.html) — session limits, `encapsulation replicate` and destination-port behaviour.
- Cisco — [Configuring ERSPAN](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/nmgmt/b_173_nmgmt_9300_cg/configuring_erspan.html)
- Cisco — [Catalyst Switched Port Analyzer Configuration Example](https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6500-series-switches/10570-41.html)

---

*Related: [NetFlow and Flexible NetFlow](/blog/netflow-flexible-netflow-templates-and-ipfix) · [IP SLA](/blog/ip-sla-probes-jitter-and-tracking-objects) · [Syslog and debugging](/blog/syslog-severities-timestamps-and-conditional-debugging).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
