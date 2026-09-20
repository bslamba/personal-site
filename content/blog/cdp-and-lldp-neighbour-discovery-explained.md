---
title: "CDP and LLDP: Neighbour Discovery, and the Information You Are Broadcasting"
excerpt: "Two protocols that tell you what is plugged into every port without touching a single cable — and tell anyone else on that port the same thing. Here is what each frame actually carries, why LLDP-MED is what makes an IP phone find its voice VLAN, and why both belong switched off on ports facing people you do not control."
date: "2026-09-24"
tags: ["CDP", "LLDP", "Discovery", "Layer 2", "Switching", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 2.3 *Configure and verify Layer 2 discovery protocols (Cisco Discovery Protocol and LLDP)*.

## Cheat sheet

| | **CDP** | **LLDP** |
|---|---|---|
| **Standard** | Cisco proprietary | **IEEE 802.1AB** |
| **Destination MAC** | `01:00:0C:CC:CC:CC` | `01:80:C2:00:00:0E` |
| **Encapsulation** | **SNAP**, OUI `00000C`, PID `0x2000` | **EtherType `0x88CC`** |
| **Default timer** | **60 s**, holdtime **180 s** | **30 s**, holdtime **120 s** |
| **On by default** | **Yes**, globally and per interface | **No** — needs `lldp run` |
| **Enable / disable** | `cdp run` · `cdp enable` | `lldp run` · `lldp transmit` / `lldp receive` |
| **Voice extension** | Cisco voice VLAN TLV | **LLDP-MED** |
| **Crosses a switch?** | No — link local, never forwarded | No |

**The two things worth remembering.** LLDP's transmit and receive are **separate** settings, so a port can advertise without listening or the reverse — and `show lldp neighbors` empty on one side only is usually that, not a cable fault. And both protocols broadcast your platform, software version and interface names to whatever is plugged in, which is why they belong off on user-facing ports.

---

## What is actually in the frame

Both protocols do the same job with the same shape: a fixed header and then a list of **type-length-value** items. The difference is who defined the types.

<div class="cap">
<div class="cap-head">Capture · CDP advertisement <span class="cap-filter">cdp</span></div>
<div class="cap-hex"><pre>0000  <mark>01 00 0c cc cc cc</mark> 00 1a  2b 3c 4d 5e 00 62 <mark>aa aa</mark>   ........+&lt;M^.b..
0010  <mark>03 00 00 0c 20 00</mark> <mark>02</mark> <mark>b4</mark>  0b 05 <mark>00 01</mark> 00 13 53 57   .... .........SW
0020  31 2e 65 78 61 6d 70 6c  65 2e 63 6f 6d <mark>00 03</mark> 00   1.example.com...
0030  19 47 69 67 61 62 69 74  45 74 68 65 72 6e 65 74   .GigabitEthernet
0040  31 2f 30 2f 32 34 <mark>00 04</mark>  00 08 00 00 00 29 <mark>00 06</mark>   1/0/24.......)..</pre></div>
<div class="cap-note"><b>Read it left to right and the device introduces itself.</b> <code>01 00 0c cc cc cc</code> — the Cisco CDP multicast address. <code>aa aa 03 00 00 0c 20 00</code> — LLC/SNAP with Cisco's OUI and protocol ID <code>0x2000</code>, which is what makes this CDP rather than any other SNAP protocol. <code>02</code> — CDP version 2. <code>b4</code> — holdtime <b>180 seconds</b>.
<br><br>Then the TLVs, and they are readable as text: <code>00 01</code> is <b>Device ID</b> and the value is <code>SW1.example.com</code>. <code>00 03</code> is <b>Port ID</b>: <code>GigabitEthernet1/0/24</code>. <code>00 04</code> is <b>Capabilities</b>. <code>00 06</code> is <b>Platform</b>, which on a real device says something like <code>cisco WS-C9300-24T</code>.
<br><br><b>Everything an attacker wants for reconnaissance, in one unauthenticated frame, every sixty seconds.</b> Model, software version, management address, the exact port they are plugged into, and the native VLAN.</div>
</div>

<div class="cap">
<div class="cap-head">Capture · LLDP advertisement <span class="cap-filter">lldp</span></div>
<div class="cap-hex"><pre>0000  <mark>01 80 c2 00 00 0e</mark> 00 1a  2b 3c 4d 5e <mark>88 cc</mark> <mark>02 07</mark>   ........+&lt;M^....
0010  04 00 1a 2b 3c 4d 5e <mark>04</mark>  <mark>09</mark> 05 47 69 31 2f 30 2f   ...+&lt;M^...Gi1/0/
0020  32 34 <mark>06 02</mark> 00 78 <mark>0a 0f</mark>  53 57 31 2e 65 78 61 6d   24...x..SW1.exam
0030  70 6c 65 2e 63 6f 6d <mark>00  00</mark>                        ple.com..</pre></div>
<div class="cap-note"><b>LLDP packs type and length into two bytes.</b> Seven bits of type, nine bits of length — so <code>02 07</code> is <code>0000001 000000111</code>: <b>type 1 (Chassis ID), length 7</b>. The value starts with subtype <code>04</code> meaning "MAC address", then the six bytes.
<br><br><code>04 09</code> is type 2 (<b>Port ID</b>), length 9, subtype <code>05</code> = interface name, then <code>Gi1/0/24</code>. <code>06 02</code> is type 3 (<b>TTL</b>), length 2, value <code>00 78</code> = <b>120 seconds</b>. <code>0a 0f</code> is type 5 (<b>System Name</b>), length 15. And <code>00 00</code> is type 0 with length 0 — the <b>End of LLDPDU</b> marker.
<br><br>The three mandatory TLVs are Chassis ID, Port ID and TTL, in that order, always first. Everything after them — system name, description, capabilities, management address, and the whole LLDP-MED set — is optional, which is why two vendors' LLDP output can look so different.</div>
</div>

---

## Why LLDP-MED matters more than the rest of it

<div class="walk">
<div class="walk-head">An IP phone plugs in and configures itself <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="ldw" id="ld1" checked><label for="ld1"><span class="step-n">1</span>Plugged in</label>
  <input type="radio" name="ldw" id="ld2"><label for="ld2"><span class="step-n">2</span>The VLAN</label>
  <input type="radio" name="ldw" id="ld3"><label for="ld3"><span class="step-n">3</span>Power</label>
  <input type="radio" name="ldw" id="ld4"><label for="ld4"><span class="step-n">4</span>The PC behind it</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A phone plugs into an access port and knows nothing about the network">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}</style>
  <rect class="n" x="60" y="66" width="80" height="34" rx="3"/><text class="nt" x="100" y="88" text-anchor="middle">SW</text>
  <line class="l" x1="140" y1="83" x2="380" y2="83"/>
  <rect class="n" x="380" y="66" width="90" height="34" rx="3"/><text class="nt" x="425" y="88" text-anchor="middle">PHONE</text>
  <text class="s" x="425" y="118" text-anchor="middle">no VLAN, no QoS marking, no idea where it is</text>
  <text class="k" x="320" y="152" text-anchor="middle">Untagged on an access port, with everything still to learn.</text>
</svg>
<p class="walk-say"><span class="walk-title">A phone that knows nothing yet</span>
The phone boots with no configuration. It does not know which VLAN carries voice, how much power it may draw, or what CoS value to mark its own traffic with. Without a discovery protocol it would need all of that configured by hand, on every phone.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The switch advertises the voice VLAN and the phone starts tagging its traffic">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{stroke:#1f9d6b;stroke-width:2.5;fill:none}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <rect class="n" x="60" y="70" width="80" height="34" rx="3"/><text class="nt" x="100" y="92" text-anchor="middle">SW</text>
  <rect class="n" x="380" y="70" width="90" height="34" rx="3"/><text class="nt" x="425" y="92" text-anchor="middle">PHONE</text>
  <path class="a" d="M 140 87 L 380 87"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 140 87 L 380 87"/></circle>
  <text class="m" x="260" y="64" text-anchor="middle" fill="#0f6b47">LLDP-MED: Network Policy TLV</text>
  <text class="m" x="320" y="132" text-anchor="middle">voice VLAN 110 · tagged · CoS 5 · DSCP EF</text>
  <text class="k" x="320" y="164" text-anchor="middle" fill="#0f6b47">The phone now tags its own traffic with VLAN 110 and marks it EF.</text>
  <text class="s" x="320" y="184" text-anchor="middle">The PC behind it stays untagged in the data VLAN. One port, two VLANs, zero phone configuration.</text>
</svg>
<p class="walk-say"><span class="walk-title">The Network Policy TLV does the real work</span>
LLDP-MED adds TLVs that CDP had as proprietary extensions. The important one is <b>Network Policy</b>: it tells the phone which VLAN to tag with, and what CoS and DSCP values to use.
<br><br>This is why <code>switchport voice vlan 110</code> works with no configuration on the phone at all — and why an "access" port ends up carrying a tagged VLAN, as covered in the <a href="/blog/switching-concepts-vlans-and-inter-vlan-routing">switching and VLANs</a> article. Turn LLDP-MED off and the phone lands untagged in the data VLAN, where it will usually still register and sound terrible, because it is no longer being prioritised.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Power negotiation lets the phone request exactly what it needs rather than a class default">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.a{stroke:#F2994A;stroke-width:2.5;fill:none}.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}</style>
  <rect class="n" x="60" y="70" width="80" height="34" rx="3"/><text class="nt" x="100" y="92" text-anchor="middle">SW</text>
  <rect class="n" x="380" y="70" width="90" height="34" rx="3"/><text class="nt" x="425" y="92" text-anchor="middle">PHONE</text>
  <path class="a" d="M 380 79 L 140 79"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.6s" repeatCount="indefinite" path="M 380 79 L 140 79"/></circle>
  <path class="a" d="M 140 97 L 380 97"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.6s" begin="0.8s" repeatCount="indefinite" path="M 140 97 L 380 97"/></circle>
  <text class="m" x="260" y="64" text-anchor="middle" fill="#B26014">&#8220;I need 6.5 W&#8221;   →   &#8220;granted&#8221;</text>
  <text class="k" x="320" y="140" text-anchor="middle">Without negotiation the switch reserves the full class budget for every port.</text>
  <text class="s" x="320" y="164" text-anchor="middle">On a 48-port switch that is the difference between powering everything and running out of PoE budget</text>
  <text class="s" x="320" y="180" text-anchor="middle">halfway down the patch panel.</text>
</svg>
<p class="walk-say"><span class="walk-title">Power, negotiated rather than assumed</span>
The Extended Power-via-MDI TLV lets a device ask for what it actually draws. Without it, the switch allocates the whole PoE class budget per port and can exhaust its supply long before the ports are physically full.
<br><br>It is a real operational constraint rather than a detail — "the phones on the last six ports will not power up" is usually a budget problem, and <code>show power inline</code> shows allocated versus consumed.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two devices on one port appear as two neighbours with the phone acting as a small switch">
  <style>.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.l{stroke:#8A8A93;stroke-width:1.5}.v{stroke:#4b7bec;stroke-width:2.5}.d{stroke:#1f9d6b;stroke-width:2.5}</style>
  <rect class="n" x="40" y="70" width="80" height="34" rx="3"/><text class="nt" x="80" y="92" text-anchor="middle">SW</text>
  <rect class="n" x="300" y="70" width="90" height="34" rx="3"/><text class="nt" x="345" y="92" text-anchor="middle">PHONE</text>
  <rect class="n" x="510" y="70" width="80" height="34" rx="3"/><text class="nt" x="550" y="92" text-anchor="middle">PC</text>
  <path class="v" d="M 120 80 L 300 80"/>
  <path class="d" d="M 120 94 L 300 94"/>
  <path class="d" d="M 390 87 L 510 87"/>
  <text class="s" x="210" y="70" text-anchor="middle" fill="#2b5ab8">VLAN 110 tagged</text>
  <text class="s" x="210" y="116" text-anchor="middle" fill="#0f6b47">VLAN 10 untagged</text>
  <text class="k" x="320" y="152" text-anchor="middle">One switch port, two MAC addresses, two VLANs, two LLDP neighbours.</text>
  <text class="s" x="320" y="176" text-anchor="middle">The phone is a three-port switch. Port security with the default <tspan font-family="ui-monospace,Menlo,monospace">maximum 1</tspan> err-disables this.</text>
</svg>
<p class="walk-say"><span class="walk-title">Two neighbours on one port is normal</span>
<code>show lldp neighbors</code> listing two devices on a single interface is not a fault — the phone has an internal switch and the PC hangs off it. You will see the phone in the voice VLAN and, if it forwards LLDP, the PC as well.
<br><br>It is also the reason a default port-security configuration breaks phone deployments on day one, and why <code>switchport port-security maximum 3</code> is the usual starting point on a phone port.</p>
</div>
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">cdp run</span>
<span class="t">lldp run</span>
!
interface GigabitEthernet1/0/24
 <span class="opt">! uplink to another switch — keep both</span>
 <span class="t">cdp enable</span>
 <span class="t">lldp transmit</span>
 <span class="t">lldp receive</span>
!
interface range GigabitEthernet1/0/1 - 23
 <span class="opt">! user ports — advertise nothing, still learn about phones</span>
 <span class="t">no cdp enable</span>
 <span class="t">no lldp transmit</span>
 <span class="t">lldp receive</span>
!
<span class="t">cdp timer</span> <span class="opt">60</span>
<span class="t">cdp holdtime</span> <span class="opt">180</span>
<span class="t">lldp timer</span> <span class="opt">30</span>
<span class="t">lldp holdtime</span> <span class="opt">120</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>cdp run / lldp run</dt><dd>Global on/off. <b>CDP is on by default; LLDP is not.</b> That asymmetry is why a Cisco switch shows a neighbour in <code>show cdp neighbors</code> and nothing in <code>show lldp neighbors</code> on a fresh box — LLDP has simply never been started.</dd></div>
<div class="is-key"><dt>lldp transmit /<br>lldp receive</dt><dd><b>Two separate settings, and this is LLDP's most useful feature.</b> CDP has one switch per interface; LLDP lets you <em>listen without speaking</em>. On a user port that is exactly right: you still learn what is plugged in, and you tell an attacker nothing.
<br><br>It is also the commonest LLDP fault — <code>show lldp neighbors</code> empty on one side only usually means <code>transmit</code> is off there, not that anything is broken.</dd></div>
<div class="is-key"><dt>no cdp enable<br><span class="opt">(on user ports)</span></dt><dd>CDP is all-or-nothing per interface, so on a port facing people you do not control, off is the answer. <b>But check what you break first</b> — Cisco IP phones use CDP for the voice VLAN and power negotiation on older firmware, so disabling CDP on a phone port without LLDP-MED configured will drop the phone into the data VLAN.</dd></div>
<div><dt>cdp timer 60<br>holdtime 180</dt><dd>Advertise every 60 s, and a neighbour that goes quiet is removed after 180. The holdtime should always be about three times the timer — set it lower and neighbours flap; higher and a device that has gone stays listed long after it left.</dd></div>
<div><dt>lldp timer 30<br>holdtime 120</dt><dd>LLDP is faster by default — 30 and 120. If you are correlating neighbour tables against a CMDB, that difference means LLDP reflects reality sooner after a change.</dd></div>
<div><dt><span class="opt">lldp med-tlv-select</span></dt><dd>Controls which LLDP-MED TLVs are sent. The one that matters is <code>network-policy</code>, which carries the voice VLAN. If phones are landing in the wrong VLAN with LLDP configured, check this before anything else.</dd></div>
</dl>
</div>

<div class="warn">
<b>What you are telling the room</b>
A single CDP frame carries the device name, the exact model, the software version, the management IP address, the port you are plugged into, the native VLAN and the duplex. LLDP with all TLVs enabled is comparable. None of it is authenticated and none of it is encrypted.
<br><br>For an attacker on a wall port that is a complete reconnaissance package delivered every sixty seconds without them sending a packet — model and version narrow the exploit search immediately, and the management address tells them where to go next. <b>Both protocols belong off, or receive-only, on anything facing an untrusted space.</b>
<br><br>It also has a safety dimension worth knowing: CDP can reveal a device's native VLAN to whatever is plugged in, which is one of the pieces needed for a VLAN hopping attempt.
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SW1 — mapping a rack without leaving your desk</div>
<pre><span class="p">SW1#</span> <span class="c">show cdp neighbors</span>
Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge
                  <span class="y">S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone</span>

Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
DIST-01          Gig 1/0/24         <span class="g">167</span>        <span class="y">R S I</span>       WS-C9500- Gig 1/0/1
SEP0021A0BBCC11  Gig 1/0/5          <span class="g">148</span>        <span class="y">H P M</span>       IP Phone  Port 1

<span class="o">! Holdtime counts DOWN from 180. If you catch one in the 20s it is about to</span>
<span class="o">! expire — that neighbour has stopped advertising.</span>
<span class="o">! "SEP" + MAC is the naming convention for a Cisco IP phone.</span>

<span class="p">SW1#</span> <span class="c">show cdp neighbors detail</span>
Device ID: DIST-01
Entry address(es):
  <span class="y">IP address: 10.0.0.2</span>                 <span class="o">&lt;- the management address, handed over freely</span>
Platform: cisco WS-C9500-24Y4C,  Capabilities: Router Switch IGMP
Interface: GigabitEthernet1/0/24,  Port ID (outgoing port): GigabitEthernet1/0/1
Version :
<span class="y">Cisco IOS XE Software, Version 17.09.03</span>       <span class="o">&lt;- exact version. To anyone on that port.</span>
<span class="y">Native VLAN: 999</span>
Duplex: full

<span class="p">SW1#</span> <span class="c">show lldp neighbors</span>
Device ID       Local Intf   Hold-time  Capability   Port ID
DIST-01         Gi1/0/24     <span class="g">109</span>        B,R          Gi1/0/1
SEP0021A0BBCC11 Gi1/0/5      <span class="g">98</span>         B,T          Port 1

<span class="p">SW1#</span> <span class="c">show lldp interface Gi1/0/5</span>
Gi1/0/5:
    Tx: <span class="r">disabled</span>
    Rx: <span class="g">enabled</span>                            <span class="o">&lt;- listen only. The far end sees nothing from us.</span>
    Tx state: IDLE
    Rx state: WAIT FOR FRAME<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Two commands map a rack.</b> <code>show cdp neighbors</code> gives you the topology; <code>detail</code> gives you the management address and software version of everything adjacent, which is how you find the IP of a switch nobody documented. That same usefulness is exactly what makes it a disclosure problem on an untrusted port — the command is doing the same thing for an attacker.</p>

<div class="real">
<b>In the real world</b>
CDP and LLDP are the fastest way to find out what a network actually looks like, and they are frequently the <em>only</em> accurate source. Walk a switch's neighbour table and you have adjacencies, models, software versions and management addresses for the whole rack in two commands — often more current than whatever diagram exists.
<br><br>That makes a scripted <code>show cdp neighbors detail</code> across your estate a genuinely good inventory source, and it makes leaving both protocols enabled on user ports a genuinely bad idea. The same property that makes discovery useful to you makes it useful to anyone with a cable.
</div>

---

## What goes wrong

**`show lldp neighbors` is empty.** `lldp run` was never configured — it is off by default, unlike CDP.

**Neighbour appears on one side only.** `lldp transmit` is disabled at the quiet end. Check `show lldp interface`.

**A phone lands in the data VLAN.** LLDP-MED network-policy TLV is not being sent, or CDP was disabled on a phone port that relied on it.

**Neighbours flap in and out.** Holdtime set too close to the timer. Keep holdtime at roughly three times the advertisement interval.

**A device that was removed still shows.** Normal until the holdtime expires — up to 180 s for CDP.

**Nothing at all over a link that is up.** Both protocols are link-local and never cross a switch. If there is a media converter or a provider circuit in between, it may be consuming the frames.

**Neighbour output shows the wrong port.** Port ID subtype differs between vendors — some send an interface name, some send a MAC. Both are valid.

---

<div class="lab">
<div class="lab-head">Lab — map a network, then stop it mapping you</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a neighbour table and use it to discover a device nobody documented. Capture both protocols and read the device model, software version and native VLAN out of the hex yourself. Then turn LLDP into receive-only on a user port and confirm from the other side that you have gone silent while still learning what is plugged in.</div>

**Topology.** Two or three switches, an IP phone or a Linux host running `lldpd`, and a capture machine on a SPAN port.

<p class="lab-step"><span class="n">1</span>Discover a device you have no details for</p>

```cisco
SW1# show cdp neighbors
SW1# show cdp neighbors detail
```

<div class="lab-watch"><b>Things to notice</b>
You now have the management IP, platform and exact software version of every adjacent device — without logging into any of them. <b>SSH straight to an address you learned from the table</b> to prove the point.
<br><br>Then run <code>show lldp neighbors</code> on a switch where you have not configured anything and find it empty. CDP on, LLDP off, by default. That asymmetry is the first thing to check whenever LLDP "does not work".</div>

<p class="lab-step"><span class="n">2</span>Read both frames by hand</p>

Capture on a trunk with `cdp or lldp` and open one of each.

<div class="lab-watch"><b>Things to notice</b>
In the CDP frame, find <code>aa aa 03 00 00 0c 20 00</code> — the SNAP header with Cisco's OUI and PID <code>0x2000</code> — and then read the device name and port name straight out of the ASCII column.
<br><br>In the LLDP frame, decode a TLV header by hand: take the two bytes, shift right 9 for the type and mask the low 9 bits for the length. Confirm the first three TLVs are Chassis ID, Port ID and TTL in that order, and find the <code>00 00</code> end marker.
<br><br>Then find the <b>native VLAN</b> in the CDP detail output and consider that anyone on that port has it too.</div>

<p class="lab-step"><span class="n">3</span>Go receive-only</p>

```cisco
interface GigabitEthernet1/0/5
 no cdp enable
 no lldp transmit
 lldp receive
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The far end still sees you</b> — check <code>show lldp interface</code> confirms <code>Tx: disabled</code>, and remember the existing entry survives until its holdtime expires. Wait 120 seconds.</li>
<li><b>You stopped seeing the far end too</b> — you disabled <code>receive</code> as well, or the far end only speaks CDP and you disabled that.</li>
<li><b>A phone dropped out of the voice VLAN</b> — it was using CDP. Configure LLDP-MED, or leave CDP enabled on phone ports specifically.</li>
</ul>
Capture again and confirm <b>no frames leave that port</b> while the neighbour entry for whatever is plugged in still populates. That asymmetry — learn without telling — is LLDP's best practical feature and CDP cannot do it.</div>

<p class="lab-step"><span class="n">4</span>Watch a holdtime expire</p>

Shut the neighbour's interface and poll `show cdp neighbors` every 30 seconds.

<div class="lab-watch"><b>Things to notice</b>
The holdtime counts down from 180 and the entry vanishes when it reaches zero — so a neighbour table can be <b>three minutes stale</b>. If you are using it during an incident to decide what is still connected, that lag matters.
<br><br>LLDP's 120-second holdtime clears faster. Then set <code>cdp timer 5</code> and <code>cdp holdtime 15</code> and watch it become nearly real time — and think about the trade: more frames, faster truth.</div>

<p class="lab-step"><span class="n">5</span>See a phone configure itself</p>

With a phone on a port configured with a voice VLAN, capture while it boots.

<div class="lab-watch"><b>Things to notice</b>
Find the <b>Network Policy TLV</b> in the switch's LLDP-MED advertisement and read the VLAN, CoS and DSCP values out of it. Then confirm in <code>show mac address-table interface</code> that the phone appears in the voice VLAN and the PC behind it in the data VLAN.
<br><br>Now disable the network-policy TLV and reboot the phone: it comes up untagged in the data VLAN, usually still registers, and sounds worse under load because nothing is prioritising it. <b>That is a fault that gets reported as "call quality" and diagnosed as a discovery problem.</b></div>

<div class="lab-earned"><b>What you earned</b>
You can map an undocumented rack from two commands and reach a device whose address you did not have. You can read a CDP or LLDP frame in hex and pull out the model, version and native VLAN — which is also exactly what an attacker on a wall port gets for free, so the case for disabling it on user ports is now something you have seen rather than been told. You know LLDP can listen without speaking and CDP cannot, and you know that turning CDP off on a phone port without LLDP-MED in place quietly drops the phone into the wrong VLAN.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Why is <code>show lldp neighbors</code> empty on a switch where CDP shows neighbours?</p>
<label class="qz-opt"><input type="radio" name="cdq1"><span>LLDP is off by default — it needs <code>lldp run</code></span><em class="qz-fb qz-good">Correct. CDP is enabled by default on Cisco equipment and LLDP is not, which is the first thing to check.</em></label>
<label class="qz-opt"><input type="radio" name="cdq1"><span>LLDP cannot see Cisco devices</span><em class="qz-fb qz-bad">LLDP is the vendor-neutral one; Cisco devices speak it fine once it is enabled.</em></label>
<label class="qz-opt"><input type="radio" name="cdq1"><span>They use different VLANs</span><em class="qz-fb qz-bad">Both are link-local and untagged on the native VLAN.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Which capability does LLDP have that CDP does not?</p>
<label class="qz-opt"><input type="radio" name="cdq2"><span>Separate transmit and receive control per interface</span><em class="qz-fb qz-good">Correct — so a port can listen without advertising. On user-facing ports that is exactly what you want, and CDP is all-or-nothing.</em></label>
<label class="qz-opt"><input type="radio" name="cdq2"><span>It crosses switches to find remote devices</span><em class="qz-fb qz-bad">Both are strictly link-local and are never forwarded.</em></label>
<label class="qz-opt"><input type="radio" name="cdq2"><span>It is encrypted</span><em class="qz-fb qz-bad">Neither is authenticated or encrypted.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What does the LLDP-MED Network Policy TLV do?</p>
<label class="qz-opt"><input type="radio" name="cdq3"><span>Tells a phone which VLAN to tag with, and what CoS and DSCP to mark</span><em class="qz-fb qz-good">Correct — it is what makes <code>switchport voice vlan</code> work with zero configuration on the phone. Disable it and the phone lands untagged in the data VLAN.</em></label>
<label class="qz-opt"><input type="radio" name="cdq3"><span>Applies an ACL to the phone</span><em class="qz-fb qz-bad">LLDP advertises information; it does not push policy enforcement.</em></label>
<label class="qz-opt"><input type="radio" name="cdq3"><span>Negotiates PoE</span><em class="qz-fb qz-bad">That is the Extended Power-via-MDI TLV, a separate one.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why disable these protocols on user-facing ports?</p>
<label class="qz-opt"><input type="radio" name="cdq4"><span>They advertise model, software version, management address and native VLAN to anything plugged in</span><em class="qz-fb qz-good">Correct — unauthenticated reconnaissance delivered every 30 or 60 seconds. Receive-only LLDP keeps the visibility without the disclosure.</em></label>
<label class="qz-opt"><input type="radio" name="cdq4"><span>They consume significant bandwidth</span><em class="qz-fb qz-bad">One small frame per interval is negligible.</em></label>
<label class="qz-opt"><input type="radio" name="cdq4"><span>They interfere with spanning tree</span><em class="qz-fb qz-bad">They are independent of STP.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>A removed device still appears in <code>show cdp neighbors</code>. Why?</p>
<label class="qz-opt"><input type="radio" name="cdq5"><span>The holdtime has not expired — up to 180 seconds by default</span><em class="qz-fb qz-good">Correct, and worth knowing during an incident: a CDP neighbour table can be three minutes out of date.</em></label>
<label class="qz-opt"><input type="radio" name="cdq5"><span>The entry is static and must be cleared</span><em class="qz-fb qz-bad">All entries are learned and age out on their own.</em></label>
<label class="qz-opt"><input type="radio" name="cdq5"><span>CDP caches indefinitely</span><em class="qz-fb qz-bad">It ages out at the holdtime.</em></label>
</div>

---

## References

- **IEEE 802.1AB** — Station and Media Access Control Connectivity Discovery (LLDP).
- **ANSI/TIA-1057** — LLDP-MED, including the Network Policy and Extended Power TLVs.
- Cisco — [Configuring LLDP, LLDP-MED and Wired Location Service](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/nmgmt/b_173_nmgmt_9300_cg/configuring_lldp__lldp_med__and_wired_location_service.html)
- Cisco — [Cisco Discovery Protocol Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/cdp/configuration/xe-17/cdp-xe-17-book.html)

---

*Related: [Switching and VLANs](/blog/switching-concepts-vlans-and-inter-vlan-routing) · [Layer 2 security](/blog/layer-2-security-port-security-dhcp-snooping-and-dai) · [802.1Q trunking](/blog/dot1q-trunking-native-vlan-and-dtp-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
