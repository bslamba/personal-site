---
title: "NetFlow, Flexible NetFlow and IPFIX: What the Exporter Actually Sends"
excerpt: "NetFlow is not packet capture — it is a summary of conversations, and that difference is what makes it cheap enough to leave running everywhere. The part that catches people is v9's template: the data flowset is a bare sequence of bytes with no field names, and a collector that missed the template cannot decode a single record."
date: "2026-09-26"
tags: ["NetFlow", "IPFIX", "Flexible NetFlow", "Monitoring", "Troubleshooting", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 4.2 *Configure and verify NetFlow and Flexible NetFlow*. ENARSI 300-410 — 4.6 *Configure and verify NetFlow and Flexible NetFlow*.

## Cheat sheet

| | |
|---|---|
| **A flow** | Packets sharing the same key fields, in one direction, through one interface |
| **Classic 5-tuple** | src IP · dst IP · src port · dst port · protocol (plus ToS and input interface in v5) |
| **Key fields** | `match` — define the flow. Two packets differing in any key are two flows |
| **Non-key fields** | `collect` — recorded *about* the flow (counters, timestamps, next hop, AS) |
| **Record** | What to match and collect |
| **Exporter** | Where to send it, from what source, which version |
| **Monitor** | Ties record + exporter together, plus the cache |
| **Applied** | `ip flow monitor NAME input` on an interface — **per direction** |
| **v5** | Fixed format, IPv4 only, no templates. Still everywhere |
| **v9** | **Template-based**, extensible, IPv6/MPLS/multicast capable |
| **IPFIX (v10)** | RFC 7011. v9 standardised, with enterprise-specific fields |
| **Active timeout** | Default **30 min** — exports a long flow while it is still running |
| **Inactive timeout** | Default **15 s** — exports a flow that has gone quiet |

**The sentence to carry into the exam and the job.** In v9 and IPFIX, **the data records carry no field names** — just packed bytes whose meaning lives in a separate template flowset. If the collector has not received the current template, it receives your data and cannot decode any of it, which looks exactly like "NetFlow is not working" from both ends.

---

## A flow is a conversation, not a packet

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Many packets sharing the same five key fields collapse into a single flow cache entry with counters">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv1 .pk{fill:#4b7bec;opacity:.85}.sv1 .cache{fill:rgba(31,157,107,.12);stroke:#1f9d6b}
  </style>
  <text class="hdr" x="14" y="20">PACKETS ON THE WIRE</text>
  <rect class="pk" x="14" y="32" width="26" height="16" rx="2"/><rect class="pk" x="46" y="32" width="26" height="16" rx="2"/>
  <rect class="pk" x="78" y="32" width="26" height="16" rx="2"/><rect class="pk" x="110" y="32" width="26" height="16" rx="2"/>
  <rect class="pk" x="142" y="32" width="26" height="16" rx="2"/><rect class="pk" x="174" y="32" width="26" height="16" rx="2"/>
  <rect class="pk" x="206" y="32" width="26" height="16" rx="2"/><rect class="pk" x="238" y="32" width="26" height="16" rx="2"/>
  <rect class="pk" x="270" y="32" width="26" height="16" rx="2"/><rect class="pk" x="302" y="32" width="26" height="16" rx="2"/>
  <text class="s" x="342" y="45">… 148 more, all 10.1.10.50:51000 &#8594; 192.0.2.10:443</text>
  <path d="M 320 62 L 320 86" stroke="#8A8A93" stroke-width="1.5"/>
  <path d="M 314 80 L 320 90 L 326 80 z" fill="#8A8A93"/>
  <text class="k" x="336" y="80">collapse into</text>
  <rect class="cache" x="14" y="98" width="612" height="62"/>
  <text class="hdr" x="26" y="118" fill="#0f6b47">ONE FLOW CACHE ENTRY</text>
  <text class="m" x="26" y="138">10.1.10.50  192.0.2.10  51000  443  TCP   pkts 3   bytes 148</text>
  <text class="s" x="26" y="153">five key fields — the identity of the flow            counters — what accumulated</text>
  <rect x="14" y="176" width="612" height="72" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="196">That ratio is the entire value proposition.</text>
  <text class="s" x="26" y="214">A full packet capture of that conversation is megabytes. The flow record is a few dozen bytes and still</text>
  <text class="s" x="26" y="230">answers who talked to whom, for how long, how much, and out of which interface.</text>
  <text class="s" x="26" y="246">What it cannot answer is <tspan font-weight="700">what they said</tspan> — for that you still need a capture.</text>
</svg>
<figcaption><b>Figure 1.</b> NetFlow trades content for scale. You lose the payload and gain the ability to leave it running on every interface for ever.</figcaption>
</figure>

<div class="why">
<b>Key fields define identity — and they are a decision, not a default</b>
Every field you <code>match</code> is part of the flow's identity, so <b>adding a key field multiplies your cache entries</b>. Match on TCP flags and a single conversation becomes several flows. Match on nothing but source address and the whole internet becomes one flow per host, which is tiny — and sometimes exactly what you want for a top-talkers report.
<br><br>Fields you <code>collect</code> cost nothing in cardinality. When in doubt, collect rather than match.
</div>

---

## The template, and the thing that goes wrong

<div class="walk">
<div class="walk-head">A NetFlow v9 export, byte by byte <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="nfw" id="nf1" checked><label for="nf1"><span class="step-n">1</span>Header</label>
  <input type="radio" name="nfw" id="nf2"><label for="nf2"><span class="step-n">2</span>Template flowset</label>
  <input type="radio" name="nfw" id="nf3"><label for="nf3"><span class="step-n">3</span>Data flowset</label>
  <input type="radio" name="nfw" id="nf4"><label for="nf4"><span class="step-n">4</span>The failure</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The NetFlow version 9 header declares the version and how many flowsets follow">
  <style>.sv2 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv2 .hl{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <rect class="hl" x="14" y="40" width="88" height="34"/><text class="m" x="58" y="61" text-anchor="middle">00 09</text>
  <rect class="hl" x="106" y="40" width="88" height="34"/><text class="m" x="150" y="61" text-anchor="middle">00 02</text>
  <rect class="f" x="198" y="40" width="104" height="34"/><text class="m" x="250" y="61" text-anchor="middle">uptime</text>
  <rect class="f" x="306" y="40" width="112" height="34"/><text class="m" x="362" y="61" text-anchor="middle">unix secs</text>
  <rect class="f" x="422" y="40" width="96" height="34"/><text class="m" x="470" y="61" text-anchor="middle">sequence</text>
  <rect class="f" x="522" y="40" width="104" height="34"/><text class="m" x="574" y="61" text-anchor="middle">source id</text>
  <text class="s" x="58" y="92" text-anchor="middle">version 9</text>
  <text class="s" x="150" y="92" text-anchor="middle">2 flowsets</text>
  <text class="s" x="470" y="92" text-anchor="middle">gap = loss</text>
  <text class="k" x="14" y="126">count is flowsets, not flows — one flowset can hold many records.</text>
  <text class="s" x="14" y="150">The sequence number is what the collector uses to detect export loss. UDP has no retransmission,</text>
  <text class="s" x="14" y="166">so a gap here is real data you will never see. Check it before believing a traffic graph.</text>
</svg>
<p class="walk-say"><span class="walk-title">20 bytes of header</span>
Version 9, then <b>count = number of flowsets</b> in this datagram — a point that trips people, because it is not the number of flow records.
<br><br>The <b>sequence number</b> matters operationally: exports go over UDP, nothing is retransmitted, and a gap means records the collector will never receive. When a graph looks too low, check export sequence loss before you go hunting for a routing problem.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The template flowset lists field type and length pairs that describe the layout of the data records">
  <style>.sv3 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv3 .hl{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <rect class="hl" x="14" y="30" width="96" height="30"/><text class="m" x="62" y="50" text-anchor="middle">id 0000</text>
  <rect class="f" x="114" y="30" width="96" height="30"/><text class="m" x="162" y="50" text-anchor="middle">len 002c</text>
  <rect class="hl" x="214" y="30" width="96" height="30"/><text class="m" x="262" y="50" text-anchor="middle">tmpl 0100</text>
  <rect class="f" x="314" y="30" width="96" height="30"/><text class="m" x="362" y="50" text-anchor="middle">9 fields</text>
  <text class="s" x="62" y="76" text-anchor="middle">0 = TEMPLATE</text>
  <text class="s" x="262" y="76" text-anchor="middle">template 256</text>
  <rect class="f" x="14" y="96" width="140" height="28"/><text class="m" x="84" y="115" text-anchor="middle">0008 / 0004</text>
  <rect class="f" x="158" y="96" width="140" height="28"/><text class="m" x="228" y="115" text-anchor="middle">000c / 0004</text>
  <rect class="f" x="302" y="96" width="140" height="28"/><text class="m" x="372" y="115" text-anchor="middle">0007 / 0002</text>
  <rect class="f" x="446" y="96" width="180" height="28"/><text class="m" x="536" y="115" text-anchor="middle">… 6 more pairs</text>
  <text class="s" x="84" y="140" text-anchor="middle">SRC_ADDR, 4B</text>
  <text class="s" x="228" y="140" text-anchor="middle">DST_ADDR, 4B</text>
  <text class="s" x="372" y="140" text-anchor="middle">SRC_PORT, 2B</text>
  <text class="k" x="14" y="172">Type and length. That is the whole schema.</text>
  <text class="s" x="14" y="190">The collector builds a decoder from this and stores it against template ID 256 from this exporter.</text>
</svg>
<p class="walk-say"><span class="walk-title">Flowset ID 0 means "this is a schema"</span>
The template is a list of <b>(field type, field length)</b> pairs and nothing else — no names, no delimiters. Type 8 is IPv4 source address, 4 bytes. Type 12 is destination, 4 bytes. Type 7 is L4 source port, 2 bytes.
<br><br>This is why v9 is extensible where v5 is not: adding a new field to the record means adding a pair here, and a collector that understands the type learns the new layout automatically. It is also, precisely, why the data is undecodable without it.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The data flowset is packed bytes whose meaning comes entirely from the template">
  <style>.sv4 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .hl{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <rect class="hl" x="14" y="30" width="110" height="30"/><text class="m" x="69" y="50" text-anchor="middle">id 0100</text>
  <rect class="f" x="128" y="30" width="110" height="30"/><text class="m" x="183" y="50" text-anchor="middle">len 0020</text>
  <text class="s" x="69" y="76" text-anchor="middle">= template 256</text>
  <rect class="f" x="14" y="96" width="612" height="30"/>
  <text class="m" x="24" y="116">0a 01 0a 32  c0 00 02 0a  c7 38  01 bb  06  00 03  00 05  …</text>
  <text class="s" x="24" y="142">10.1.10.50   192.0.2.10   51000  443   TCP  if3   if5</text>
  <text class="k" x="14" y="172">No names. No types. No lengths. Just bytes in template order.</text>
</svg>
<p class="walk-say"><span class="walk-title">The data record is opaque on its own</span>
Flowset ID 256 says "decode me with template 256". Then it is a bare byte string — <code>0a 01 0a 32</code> is only 10.1.10.50 <i>because the template said the first four bytes are IPv4_SRC_ADDR</i>.
<br><br>Wireshark shows exactly this. If you open a capture that starts mid-stream, the data flowsets decode as "Data (32 bytes)" with no fields, and you have to find an earlier packet containing the template before anything becomes readable. <b>That is not Wireshark failing; that is the protocol.</b></p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A collector restarted after the template was sent cannot decode data until the template is refreshed">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <rect class="n" x="20" y="40" width="90" height="32" rx="3"/><text class="nt" x="65" y="61" text-anchor="middle">EXPORTER</text>
  <rect class="n" x="520" y="40" width="100" height="32" rx="3"/><text class="nt" x="570" y="61" text-anchor="middle">COLLECTOR</text>
  <line x1="110" y1="46" x2="520" y2="46" stroke="#1f9d6b" stroke-width="2"/>
  <text class="m" x="315" y="40" text-anchor="middle" fill="#0f6b47">template 256  ✓ received, then collector restarts</text>
  <line x1="110" y1="80" x2="520" y2="80" stroke="#D3002D" stroke-width="2" stroke-dasharray="5 4"/>
  <circle r="4" fill="#D3002D"><animateMotion dur="2s" repeatCount="indefinite" path="M 110 80 L 520 80"/></circle>
  <text class="m" x="315" y="98" text-anchor="middle" fill="#B80027">data, data, data …  arriving fine, decoding into nothing</text>
  <rect x="14" y="120" width="612" height="44" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="140" fill="#B80027">Both ends look healthy. Packets are flowing. The graphs are empty.</text>
  <text class="s" x="26" y="156">The exporter's counters increment, the collector's interface counters increment, and nothing is decoded.</text>
  <rect x="14" y="176" width="612" height="34" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="s" x="26" y="198" fill="#0f6b47"><tspan font-weight="700">Fix:</tspan> template data timeout 60 — resend the schema every minute instead of the default 10.</text>
</svg>
<p class="walk-say"><span class="walk-title">The classic v9 fault</span>
Templates are resent on a timer, not with every packet. The default is roughly every <b>10 minutes or 20 packets</b>. Restart a collector one minute after a template was sent and it will receive nine minutes of undecodable data while every counter on both sides says everything is fine.
<br><br><code>template data timeout 60</code> on the exporter narrows the window to a minute. It costs a handful of extra bytes per minute and it is the single most useful line in a v9 configuration.</p>
</div>
</div>
</div>

---

## The capture

<div class="cap">
<div class="cap-bar"><span class="cap-t">netflow-v9.pcap</span><span class="cap-f">udp.port == 2055</span></div>
<table class="cap-list">
<thead><tr><th>No.</th><th>Source</th><th>Destination</th><th>Proto</th><th>Len</th><th>Info</th></tr></thead>
<tbody>
<tr><td>1</td><td>10.0.0.1</td><td>10.0.0.60</td><td>CFLOW</td><td>124</td><td>total: 2 (v9) records</td></tr>
</tbody>
</table>
<pre class="cap-bytes">0000  45 00 00 7c 7a 1c 00 00  ff 11 2d 18 0a 00 00 01   E..|z.....-.....
0010  0a 00 00 3c c3 cb 08 07  00 68 00 00 <b>00 09</b> <b>00 02</b>   ...&lt;.....h......
0020  00 12 d6 87 6a b4 a7 48  00 00 00 29 00 00 00 00   ....j..H...)....
0030  <b>00 00</b> 00 2c <b>01 00</b> 00 09  00 08 00 04 00 0c 00 04   ...,............
0040  00 07 00 02 00 0b 00 02  00 04 00 01 00 0a 00 02   ................
0050  00 0e 00 02 00 02 00 04  00 01 00 04 <b>01 00</b> 00 20   ...............
0060  <b>0a 01 0a 32</b> <b>c0 00 02 0a</b>  <b>c7 38</b> <b>01 bb</b> <b>06</b> 00 03 00   ...2.....8......
0070  05 00 00 00 94 00 01 69  00 00 00 00               .......i....</pre>
<div class="cap-note">
<b>00 09</b> version 9 · <b>00 02</b> two flowsets · <b>00 00</b> flowset ID 0 = template · <b>01 00</b> template ID 256 · nine (type, length) pairs · then <b>01 00</b> again as the data flowset ID, pointing back at that template.<br>
The record itself: <b>0a 01 0a 32</b> = 10.1.10.50 · <b>c0 00 02 0a</b> = 192.0.2.10 · <b>c7 38</b> = port 51000 · <b>01 bb</b> = port 443 · <b>06</b> = TCP. Then in/out SNMP ifIndex 3 and 5, 148 packets, 92,009 bytes.<br>
<b>Cover the template half of this packet and the bottom two lines become unreadable.</b> That is the entire v9 troubleshooting story in one screen.
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">flow record</span> <span class="opt">FR-IPV4</span>
 <span class="t">match ipv4 source address</span>
 <span class="t">match ipv4 destination address</span>
 <span class="t">match transport source-port</span>
 <span class="t">match transport destination-port</span>
 <span class="t">match ipv4 protocol</span>
 <span class="t">match interface input</span>
 <span class="t">collect counter bytes</span>
 <span class="t">collect counter packets</span>
 <span class="t">collect timestamp sys-uptime first</span>
 <span class="t">collect timestamp sys-uptime last</span>
 <span class="t">collect routing next-hop address ipv4</span>
 <span class="t">collect transport tcp flags</span>
!
<span class="t">flow exporter</span> <span class="opt">EXP-1</span>
 <span class="t">destination</span> <span class="opt">10.0.0.60</span>
 <span class="t">source</span> <span class="opt">Loopback0</span>
 <span class="t">transport udp</span> <span class="opt">2055</span>
 <span class="t">export-protocol</span> <span class="opt">netflow-v9</span>
 <span class="t">template data timeout</span> <span class="opt">60</span>
!
<span class="t">flow monitor</span> <span class="opt">FM-IPV4</span>
 <span class="t">record</span> <span class="opt">FR-IPV4</span>
 <span class="t">exporter</span> <span class="opt">EXP-1</span>
 <span class="t">cache timeout active</span> <span class="opt">60</span>
 <span class="t">cache timeout inactive</span> <span class="opt">15</span>
!
<span class="t">interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">ip flow monitor</span> <span class="opt">FM-IPV4</span> <span class="t">input</span>
 <span class="t">ip flow monitor</span> <span class="opt">FM-IPV4</span> <span class="t">output</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>match …</dt><dd><b>Key fields — these define the flow.</b> Two packets differing in any one of them are two separate flows. Every key you add multiplies cache entries, so this is a deliberate trade between detail and memory, not a checklist to fill in.</dd></div>
<div><dt>collect …</dt><dd>Non-key. Recorded <i>about</i> the flow without affecting its identity, so they cost no cardinality. <code>collect transport tcp flags</code> is the one to remember — it distinguishes a real conversation from a SYN that was never answered, which is how a port scan looks in flow data.</dd></div>
<div class="is-key"><dt>source Loopback0</dt><dd>The exporter's source address is <b>the exporter's identity to the collector</b>, and templates are cached per exporter. Let it float with the outgoing interface and the collector sees a new exporter with no template every time routing changes.</dd></div>
<div><dt>transport udp 2055</dt><dd>Convention, not a standard — 2055, 9995 and 9996 are all common. UDP means no retransmission: a dropped export is data you never get, which is what the header sequence number is there to reveal.</dd></div>
<div class="is-key"><dt>template data timeout 60</dt><dd><b>How often the schema is resent.</b> The default is around 10 minutes; until the collector has the template it cannot decode anything. Sixty seconds bounds the blind window after any collector restart to a minute. Cheap insurance.</dd></div>
<div class="is-key"><dt>cache timeout active 60</dt><dd><b>The default is 1800 seconds — 30 minutes.</b> A long download is not exported until it ends or that timer fires, so with the default your graphs lag reality by up to half an hour and a big transfer appears as one enormous spike at the end. Sixty seconds is the usual production value.</dd></div>
<div><dt>cache timeout inactive 15</dt><dd>How long a quiet flow waits before it is exported and evicted. Too long wastes cache on finished conversations; too short splits one conversation into several records.</dd></div>
<div class="is-key"><dt>ip flow monitor … input / output</dt><dd><b>Per direction, and applying only <code>input</code> is the most common configuration mistake in the topic.</b> You see half of every conversation, traffic totals look wrong by roughly half, and nothing anywhere reports an error. On many platforms <code>input</code> on every interface is the cleaner design — but be deliberate about it rather than accidental.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — cache first, then exporter</div>
<pre><span class="p">R1#</span> <span class="c">show flow monitor FM-IPV4 cache format table</span>
  Cache type:                               Normal (Platform cache)
  Cache size:                                            4096
  <span class="y">Current entries:</span>                                        <span class="g">312</span>
  <span class="y">Flows added:</span>                                         1284511
  Flows aged:                                          1284199
    - Active timeout      (    60 secs)                 88214
    - Inactive timeout    (    15 secs)               1195985

IPV4 SRC ADDR   IPV4 DST ADDR   TRNS SRC  TRNS DST  PROT  bytes   pkts
=============== =============== ========  ========  ====  ======  ====
10.1.10.50      192.0.2.10          51000       443     6   92009   148
10.1.10.50      10.1.20.9           49318       445     6    4410    31
10.1.10.77      8.8.8.8             53122        53    17     310     4

<span class="o">! "Current entries" near cache size = you are evicting early. Raise it,</span>
<span class="o">! or reduce key fields. Undersized caches quietly lose accuracy.</span>

<span class="p">R1#</span> <span class="c">show flow exporter EXP-1 statistics</span>
Flow Exporter EXP-1:
  Packet send statistics (last cleared 04:21:09 ago):
    <span class="g">Successfully sent:  18422  (2148334 bytes)</span>
    <span class="r">Reason not given:       0  (0 bytes)</span>
    <span class="r">No destination route:   0  (0 bytes)</span>      <span class="o">&lt;- non-zero = routing, not NetFlow</span>
  <span class="y">Client send statistics:</span>
    Client: Flow Monitor FM-IPV4
      Records added:  1284199
        - sent:       <span class="g">1284199</span>
      Bytes added:    <span class="g">2148334</span>

<span class="p">R1#</span> <span class="c">show flow interface GigabitEthernet0/1</span>
Interface GigabitEthernet0/1
  FNF:  monitor:          FM-IPV4
        direction:        <span class="y">Input</span>
        traffic(ip):      on
<span class="o">! Only Input. Half the conversation is invisible and nothing warns you.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Work outward.</b> Cache has entries → the monitor is seeing traffic. Exporter shows records sent → it is leaving the box. Nothing on the collector after both of those are healthy → template, firewall, or the collector's own exporter list. <code>show flow interface</code> is the one that catches the missing direction, and it is worth making it a reflex.</p>

<div class="real">
<b>In the real world</b>
The question NetFlow answers that nothing else can is <b>"what was using the circuit at 02:40 last Tuesday?"</b>. Nobody was capturing at 02:40. SNMP tells you the interface was at 95%, which you already knew from the alert. Flow records tell you which host, which destination, which port, and how much — retrospectively, because it was always running.
<br><br>The second-commonest use is security: flows with a SYN flag and almost no bytes, fanning out to hundreds of destinations on one port, is a scan — visible in flow data without any payload inspection at all. Which is also why flow exports are worth treating as sensitive: they are a complete record of who talked to whom.
</div>

---

## v5, v9, IPFIX

| | v5 | v9 | IPFIX (v10) |
|---|---|---|---|
| Format | Fixed | **Template** | **Template** |
| Extensible | No | Yes | Yes + enterprise fields |
| IPv6 / MPLS | No | Yes | Yes |
| Variable-length fields | No | No | **Yes** (URLs, usernames) |
| Transport | UDP | UDP | UDP, **SCTP**, TCP |
| Standard | Cisco | Cisco (RFC 3954, informational) | **RFC 7011, Standards Track** |

IPFIX is v9 with the rough edges taken off — variable-length fields, a proper enterprise-specific number space, and SCTP so exports are not silently lost. Everything you know about v9 templates applies unchanged; the flowset ID for a template is 2 rather than 0, and that is most of the difference you will notice.

---

## What goes wrong

**Collector receives packets but shows no flows.** Template not received. Lower `template data timeout`; check the collector's start time against the last template.

**Traffic totals look about half right.** Monitor applied `input` only.

**Graphs lag by up to 30 minutes.** Default `cache timeout active 1800`.

**Collector shows a new unknown exporter after a link flap.** No `source` on the exporter, so its address followed the outgoing interface.

**Export sequence gaps.** UDP loss between exporter and collector. Real, unrecoverable data loss.

**Cache full, `Current entries` pinned at cache size.** Too many key fields or too small a cache — flows are being evicted before they age out and the counts are wrong.

**`No destination route` incrementing.** Not a NetFlow problem. The router cannot route to the collector.

---

<div class="lab">
<div class="lab-head">Lab — build a monitor, then break the template on purpose</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a Flexible NetFlow record, exporter and monitor and watch real flows appear in the cache. Capture the exports and decode a template and a data flowset by hand. Then produce the classic v9 failure — data arriving, nothing decoding — and fix it with one line. Finish by proving what a missing direction costs you.</div>

**Topology.** R1 with hosts behind it and a collector on a reachable subnet. A Linux box for the collector is enough: `nfcapd -p 2055 -l /tmp/nf`, or just `tcpdump -i any -w nf.pcap udp port 2055` and read it in Wireshark.

<p class="lab-step"><span class="n">1</span>Record, exporter, monitor</p>

Enter the three blocks from the configuration above, then apply the monitor **input only** — deliberately, for now.

```cisco
R1# show flow monitor FM-IPV4 cache format table
```

<div class="lab-watch"><b>Things to notice</b>
Generate traffic and watch entries appear. Each row is a conversation, not a packet — note the packet and byte counters climbing on a single row while you hold a download open.
<br><br>Watch <code>Current entries</code> against <code>Cache size</code>. Then add <code>match transport tcp flags</code> to the record and reapply: <b>the same traffic now produces noticeably more entries</b>, because a field that was informational has become part of the flow's identity. That is key versus non-key, demonstrated rather than memorised.</div>

<p class="lab-step"><span class="n">2</span>Capture the export and find the template</p>

```bash
tcpdump -i eth0 -w nf.pcap udp port 2055
```

Open it in Wireshark and filter `cflow`.

<div class="lab-watch"><b>Things to notice</b>
Find a packet containing a <b>template flowset</b> (flowset ID 0) and read the (type, length) pairs. Then find a <b>data flowset</b> and confirm Wireshark labels its fields with names that appear nowhere in its bytes.
<br><br>Now the instructive bit: open the capture starting from a packet <i>after</i> the template. Wireshark shows <b>"Data (32 bytes)"</b> and nothing more. <b>The bytes are identical; only your knowledge of the schema changed.</b></div>

<p class="lab-step"><span class="n">3</span>Break it the way production breaks it</p>

Leave the default `template data timeout`. Start the collector, let it receive a template, then restart the collector immediately after one arrives.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It decodes anyway</b> — your collector cached templates across the restart, or a refresh had just fired. Clear its state and retry right after a template.</li>
<li><b>Nothing arrives at all</b> — check <code>show flow exporter statistics</code> for <code>No destination route</code>, then the firewall on the collector.</li>
<li><b>It recovers after a while</b> — that is the timeout expiring. Time it.</li>
</ul>
Meanwhile: the exporter's counters increment, the collector's interface counters increment, and the graphs are empty. <b>Both ends report health while the system is useless.</b> Now add <code>template data timeout 60</code> and repeat — the blind window shrinks to under a minute.</div>

<p class="lab-step"><span class="n">4</span>Feel the active timeout</p>

Set `cache timeout active 1800` (the default), start a long sustained transfer, and watch the collector.

<div class="lab-watch"><b>Things to notice</b>
The transfer is invisible while it runs, then lands as <b>one enormous record</b> when it finishes. A traffic graph built on this shows nothing for twenty minutes and then a spike, which is worse than useless during an incident.
<br><br>Set it to 60 and repeat: the same transfer now reports every minute and the graph tracks reality. <b>This single default explains most "NetFlow doesn't match my SNMP graph" complaints.</b></div>

<p class="lab-step"><span class="n">5</span>Add the other direction</p>

Add `ip flow monitor FM-IPV4 output` to the interface.

<div class="lab-watch"><b>Things to notice</b>
Compare reported totals before and after against the interface counters from <code>show interface</code>. Input-only was reporting roughly half, and <b>nothing in any output flagged it</b> — the cache had entries, the exporter was sending, the collector was decoding. Everything was working and the answer was wrong.
<br><br>Run <code>show flow interface Gi0/1</code> before and after so you know exactly what that output looks like in each state.</div>

<p class="lab-step"><span class="n">6</span>See a scan in flow data</p>

From a host, run a port sweep against another host **in your lab only** — `nmap -sS 10.1.20.0/24` — with `collect transport tcp flags` in your record.

<div class="lab-watch"><b>Things to notice</b>
A fan of flows from one source to many destinations, each a handful of bytes, each with only <b>SYN</b> set and no response. Completed connections look entirely different: bidirectional, more bytes, more flags.
<br><br>You have just identified an attack pattern <b>without inspecting a single payload byte</b> — which is why flow data is a security tool as much as a capacity one, and why exports deserve to be treated as sensitive data.</div>

<div class="lab-earned"><b>What you earned</b>
You can build a Flexible NetFlow configuration from the three components and say what each one is for. You have demonstrated to yourself that key fields multiply cache entries while collect fields do not. You have decoded a v9 template and a data flowset by hand and seen the data become unreadable when the template is out of view. You have produced the collector-restart failure where every counter says healthy and no data decodes, and fixed it with one line. And you have measured what <code>input</code>-only and a 30-minute active timeout each cost you — both silent, both common.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A collector receives NetFlow v9 packets but displays no flows. Exporter statistics show records sent. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="nfq1"><span>It has not received the template, so the data flowsets cannot be decoded</span><em class="qz-fb qz-good">Correct. Data records carry no field names — the schema arrives separately, and until it does the bytes mean nothing. Lower <code>template data timeout</code>.</em></label>
<label class="qz-opt"><input type="radio" name="nfq1"><span>The active timeout is too long</span><em class="qz-fb qz-bad">That delays flows; it does not stop them decoding.</em></label>
<label class="qz-opt"><input type="radio" name="nfq1"><span>The cache is full</span><em class="qz-fb qz-bad">A full cache loses accuracy but still exports decodable records.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>What is the difference between <code>match</code> and <code>collect</code>?</p>
<label class="qz-opt"><input type="radio" name="nfq2"><span><code>match</code> defines the flow's identity; <code>collect</code> records information about it</span><em class="qz-fb qz-good">Correct — and the consequence is that every <code>match</code> multiplies cache entries while <code>collect</code> costs no cardinality.</em></label>
<label class="qz-opt"><input type="radio" name="nfq2"><span><code>match</code> filters which traffic is monitored</span><em class="qz-fb qz-bad">Common misreading. It does not filter — it keys. Filtering is a sampler or an ACL.</em></label>
<label class="qz-opt"><input type="radio" name="nfq2"><span><code>collect</code> fields are exported, <code>match</code> fields are not</span><em class="qz-fb qz-bad">Both are exported; they differ in whether they define the flow.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Default <code>cache timeout active</code> is 1800 seconds. What does that mean for a long download?</p>
<label class="qz-opt"><input type="radio" name="nfq3"><span>Nothing is exported for it until it ends or 30 minutes pass — then it lands as one large record</span><em class="qz-fb qz-good">Correct, and that is why NetFlow graphs appear to lag or spike. Production values are usually 60 seconds.</em></label>
<label class="qz-opt"><input type="radio" name="nfq3"><span>The flow is dropped from cache after 30 minutes</span><em class="qz-fb qz-bad">It is exported and restarted, not dropped.</em></label>
<label class="qz-opt"><input type="radio" name="nfq3"><span>Packets are sampled 1-in-1800</span><em class="qz-fb qz-bad">Sampling is a separate feature entirely.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Totals are about half what the interface counters say. Everything else looks healthy. What is missing?</p>
<label class="qz-opt"><input type="radio" name="nfq4"><span>The monitor is applied in one direction only</span><em class="qz-fb qz-good">Correct. <code>show flow interface</code> shows it, and nothing else warns you — the system works perfectly and reports the wrong answer.</em></label>
<label class="qz-opt"><input type="radio" name="nfq4"><span>Export packets are being dropped</span><em class="qz-fb qz-bad">Possible, but that shows as sequence gaps and is rarely so neatly half.</em></label>
<label class="qz-opt"><input type="radio" name="nfq4"><span>The record has too few collect fields</span><em class="qz-fb qz-bad">Collect fields add detail per flow; they do not change totals.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What does IPFIX add over NetFlow v9?</p>
<label class="qz-opt"><input type="radio" name="nfq5"><span>Variable-length fields, enterprise-specific elements, SCTP transport, and IETF Standards Track status</span><em class="qz-fb qz-good">Correct — v9 standardised and extended. The template model is otherwise unchanged.</em></label>
<label class="qz-opt"><input type="radio" name="nfq5"><span>It removes the need for templates</span><em class="qz-fb qz-bad">The opposite — templates are the foundation it builds on.</em></label>
<label class="qz-opt"><input type="radio" name="nfq5"><span>It adds IPv6 support</span><em class="qz-fb qz-bad">v9 already has that. v5 is the one without it.</em></label>
</div>

---

## References

- **RFC 7011** — *Specification of the IPFIX Protocol*. The template model, formally.
- **RFC 3954** — *Cisco Systems NetFlow Services Export Version 9*. Field type numbers and flowset structure.
- Cisco — [Flexible NetFlow Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/fnetflow/configuration/xe-17/fnf-xe-17-book.html)
- **IANA** — [IPFIX Information Elements](https://www.iana.org/assignments/ipfix/ipfix.xhtml) — the registry every field type number comes from.

---

*Related: [SPAN, RSPAN and ERSPAN](/blog/span-rspan-erspan-port-mirroring-explained) · [SNMP explained](/blog/snmp-v2c-v3-mibs-oids-and-traps) · [Syslog](/blog/syslog-severities-timestamps-and-conditional-debugging) · [IP SLA](/blog/ip-sla-probes-jitter-and-tracking-objects).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
