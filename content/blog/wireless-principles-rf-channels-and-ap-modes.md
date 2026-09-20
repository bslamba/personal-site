---
title: "Wireless Principles: Why Your Wi-Fi Is Slow and It Is Almost Never the Signal Bars"
excerpt: "Wireless is half duplex, shared, and unlicensed — three facts that explain nearly every complaint you will ever get. Add more power and you make it worse. Add more channels and you make it better. Here is the physics, the frame exchange, and the architecture Cisco builds on top of it."
date: "2026-09-21"
tags: ["Wireless", "802.11", "RF", "CAPWAP", "WLC", "Access Points", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 1.11 *Describe wireless principles*, 2.6 *Describe Cisco Wireless Architectures and AP modes*, 2.7 *Describe physical infrastructure connections of WLAN components*.

## Cheat sheet

| Band | Channels | Reality |
|---|---|---|
| **2.4 GHz** | **1, 6, 11** are the only non-overlapping 20 MHz channels | Longer range, three usable channels, full of microwaves and Bluetooth |
| **5 GHz** | ~25 non-overlapping 20 MHz channels | Shorter range, **far more capacity**. Some channels need DFS |
| **6 GHz** | Wi-Fi 6E — 59 channels | Clean spectrum, 6E/7 clients only |

| Term | Means |
|---|---|
| **SSID** | The network's name |
| **BSSID** | The AP radio's MAC — **one per SSID per radio** |
| **BSS** | One AP and its clients |
| **ESS** | Multiple APs sharing one SSID so clients can roam |
| **CSMA/CA** | Listen, and back off before transmitting. **Collision *avoidance*** |

| AP mode | Does |
|---|---|
| **Local** | The normal mode. Client traffic tunnelled to the WLC |
| **FlexConnect** | **Switches traffic locally** at the branch, survives WAN loss |
| **Monitor** | No clients — scans for rogues and interference |
| **Sniffer** | Captures frames and forwards them to a analyser |
| **Bridge / Mesh** | Links buildings, or backhauls over the air |
| **SE-Connect** | Dedicated spectrum analysis |

**The sentence that explains most Wi-Fi complaints.** Wireless is **half duplex on a shared medium** — only one device in range may transmit at a time, and everyone waits their turn. So the throughput a client gets is not the rate on its status bar; it is that rate divided by everyone else sharing the channel, including the neighbours' APs you do not control.

---

## Wireless principles, one by one

Wireless is radio, and radio is a **shared, half-duplex** medium — one transmitter at a time in a given space on a given frequency. Almost every wireless design decision follows from that one fact. These are the terms the blueprint names.

### RF

**RF (radio frequency)** is the physical carrier. Wi-Fi uses unlicensed bands — **2.4 GHz**, **5 GHz** and now **6 GHz** — which means you share them with neighbours, microwaves, Bluetooth and anyone else, with no right to a clear channel.

- **Beginner:** the invisible signal the AP and client use to talk.
- **Working knowledge:** two RF properties dominate design. **Higher frequency = more bandwidth but shorter range and worse penetration** (5/6 GHz is faster but does not go through walls as well as 2.4 GHz). And signal strength is measured in **dBm** (negative numbers; closer to zero is stronger) with **SNR** — the gap between signal and noise — mattering more than raw signal.
- **Pro:** the counter-intuitive rule is that **turning power up usually makes a dense deployment worse**: a louder AP is heard by more neighbouring APs, so more of them must stay silent while it talks, and the client still cannot shout back any louder from the far side of the room. Capacity comes from *more cells at lower power*, not louder ones — see [Three facts that cause everything else](#three-facts-that-cause-everything-else).

### Nonoverlapping Wi-Fi channels

A **channel** is a slice of a band. The problem is that in **2.4 GHz** the channels are only 5 MHz apart but each is ~20 MHz wide, so adjacent channels **overlap** and interfere. Only **1, 6 and 11** are far enough apart not to overlap.

- **Beginner:** use channels 1, 6 and 11 in 2.4 GHz and nothing else.
- **Working knowledge:** two APs on the **same** channel share it politely (they hear each other and take turns); two on **partially overlapping** channels corrupt each other's frames and both do worse than if they had shared. Same channel beats adjacent channel every time.
- **Pro:** 5 GHz has ~25 non-overlapping 20 MHz channels, which is why dense designs live there — but **channel bonding** (40/80/160 MHz for speed) spends that spectrum fast, so wider is not always better in a busy area. Some 5 GHz channels also require **DFS** (dynamic frequency selection), yielding to radar. This is the whole reason capacity planning is a channel problem, not a power problem.

### SSID

An **SSID (Service Set Identifier)** is the **name** of a wireless network. A **BSSID** is the AP radio's MAC address for that network; a **BSS** is one AP and its clients; an **ESS** is several APs sharing one SSID so a client can **roam** between them.

- **Beginner:** the network name you pick from the list.
- **Working knowledge:** one AP radio can advertise several SSIDs, each usually mapped to its own VLAN — but every extra SSID costs airtime, because each is beaconed ~10 times a second at the lowest data rate. Fewer SSIDs is a performance decision.
- **Pro:** a **hidden SSID is not a security control** — the name is blanked only in beacons and appears in the clear the moment a client associates or probes. Segmentation and [WPA2/WPA3](/blog/wlan-security-wpa2-wpa3-and-the-four-way-handshake) do the securing; hiding the SSID mostly just makes support harder.

### Encryption

Wireless **encryption** protects frames over the air, where anyone with an antenna can listen. The generations, newest first: **WPA3** (SAE, mandatory protected management frames), **WPA2** (AES-CCMP — the baseline), **WPA** (TKIP, deprecated) and **WEP** (broken, never use).

- **Beginner:** turn on WPA2 or WPA3; never WEP.
- **Working knowledge:** **Personal** mode uses one shared passphrase (PSK); **Enterprise** mode uses per-user credentials via [802.1X and RADIUS](/blog/aaa-radius-tacacs-explained), so nothing shared can leak.
- **Pro:** WPA2-PSK's weakness is not the cipher — it is that the [4-way handshake](/blog/wlan-security-wpa2-wpa3-and-the-four-way-handshake) hands an offline attacker everything needed to test passphrase guesses. WPA3-SAE closes exactly that, and adds forward secrecy. Deploy WPA3 where clients support it, WPA2-AES otherwise, and never leave TKIP enabled — it forces the whole WLAN down to 802.11g rates.

---

## Three facts that cause everything else

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 285" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wireless is half duplex shared and unlicensed which together explain most performance complaints">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:12px;font-weight:700}.sv1 .b{fill:#F1EEE9;stroke:#B5B5BC}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}
  </style>
  <rect class="b" x="14" y="26" width="196" height="92"/>
  <text class="k" x="30" y="50">Half duplex</text>
  <text class="s" x="30" y="72">One transmitter at a time.</text>
  <text class="s" x="30" y="88">A radio cannot listen while</text>
  <text class="s" x="30" y="104">it transmits — so collisions</text>
  <rect class="b" x="222" y="26" width="196" height="92"/>
  <text class="k" x="238" y="50">Shared</text>
  <text class="s" x="238" y="72">Everyone on the channel</text>
  <text class="s" x="238" y="88">waits for everyone else —</text>
  <text class="s" x="238" y="104">including other people's APs</text>
  <rect class="b" x="430" y="26" width="196" height="92"/>
  <text class="k" x="446" y="50">Unlicensed</text>
  <text class="s" x="446" y="72">Microwaves, Bluetooth,</text>
  <text class="s" x="446" y="88">cameras and the café</text>
  <text class="s" x="446" y="104">downstairs, all legally</text>
  <rect x="14" y="138" width="612" height="62" fill="rgba(211,0,45,.08)" stroke="#D3002D"/>
  <text class="k" x="26" y="160" fill="#B80027">So turning the power up makes things worse, not better.</text>
  <text class="s" x="26" y="180">A louder AP is heard by more APs, so more of them have to stay quiet while it talks — and clients</text>
  <text class="s" x="26" y="196">still cannot shout back from the far side of the building. You have enlarged the problem, not the coverage.</text>
  <rect x="14" y="214" width="612" height="62" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="236" fill="#0f6b47">The fix is almost always more channels, not more power.</text>
  <text class="s" x="26" y="256">More APs at LOWER power on DIFFERENT channels = more simultaneous conversations. That is capacity.</text>
  <text class="s" x="26" y="272">Coverage is a solved problem. Capacity is the one you get called about.</text>
</svg>
<figcaption><b>Figure 1.</b> Coverage and capacity are different problems, and the intuitive fix for one is the wrong fix for the other.</figcaption>
</figure>

<div class="why">
<b>Channels 1, 6 and 11 — and why anything else is worse than useless</b>
A 2.4 GHz channel is 20 MHz wide but the channels are spaced only 5 MHz apart, so channel 3 overlaps 1, 2, 4 and 5. Overlapping transmitters <b>cannot hear each other properly</b>, so CSMA/CA stops working and they corrupt each other's frames instead of taking turns.
<br><br>Two APs on the same channel share it politely and each gets half. Two APs on <b>partially</b> overlapping channels interfere and both get far less than half. <b>Same channel beats adjacent channel every time</b>, which is why 1, 6 and 11 is not a convention — it is the only arrangement that works.
</div>

---

## How a client actually joins

<div class="walk">
<div class="walk-head">From "no Wi-Fi" to passing traffic <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="wfw" id="wf1" checked><label for="wf1"><span class="step-n">1</span>Beacon</label>
  <input type="radio" name="wfw" id="wf2"><label for="wf2"><span class="step-n">2</span>Probe</label>
  <input type="radio" name="wfw" id="wf3"><label for="wf3"><span class="step-n">3</span>Auth + Assoc</label>
  <input type="radio" name="wfw" id="wf4"><label for="wf4"><span class="step-n">4</span>CSMA/CA</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An access point broadcasts a beacon roughly ten times a second advertising its name channel and security">
  <style>.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <rect class="n" x="280" y="34" width="86" height="30" rx="3"/><text class="nt" x="323" y="54" text-anchor="middle">AP</text>
  <circle cx="323" cy="49" r="34" fill="none" stroke="#4b7bec" stroke-width="1.5" opacity="0.7">
    <animate attributeName="r" values="34;120" dur="2.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite"/></circle>
  <circle cx="323" cy="49" r="34" fill="none" stroke="#4b7bec" stroke-width="1.5" opacity="0.7">
    <animate attributeName="r" values="34;120" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.7;0" dur="2.4s" begin="1.2s" repeatCount="indefinite"/></circle>
  <text class="k" x="14" y="120">Every 102.4 ms, to the broadcast address, whether anyone is listening or not.</text>
  <text class="m" x="14" y="144">SSID "CORP-WIFI"  ·  channel 6  ·  supported rates  ·  RSN: CCMP + PSK</text>
  <text class="s" x="14" y="168">A &#8220;hidden&#8221; SSID only blanks the name in this frame. Everything else still advertises the network,</text>
  <text class="s" x="14" y="184">and the name appears in the clear the moment a client associates. It is not a security control.</text>
</svg>
<p class="walk-say"><span class="walk-title">The AP shouts, constantly</span>
A <b>beacon</b> goes out roughly ten times a second carrying the SSID, the channel, the supported rates and the RSN information element that states which encryption and authentication the network uses.
<br><br>Beacons are sent at the <b>lowest mandatory rate</b> so the furthest client can hear them — which means each one occupies the channel for a relatively long time. Twelve SSIDs on one AP means twelve times the beacon overhead, and on 2.4 GHz that alone can consume a serious fraction of your airtime. <b>Fewer SSIDs is a performance decision, not tidiness.</b></p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A client sends probe requests and collects probe responses from every access point that hears it">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <rect class="n" x="20" y="72" width="90" height="30" rx="3"/><text class="nt" x="65" y="92" text-anchor="middle">client</text>
  <rect class="n" x="520" y="30" width="90" height="28" rx="3"/><text class="nt" x="565" y="49" text-anchor="middle">AP-1 ch1</text>
  <rect class="n" x="520" y="72" width="90" height="28" rx="3"/><text class="nt" x="565" y="91" text-anchor="middle">AP-2 ch6</text>
  <rect class="n" x="520" y="114" width="90" height="28" rx="3"/><text class="nt" x="565" y="133" text-anchor="middle">AP-3 ch11</text>
  <path d="M 110 82 L 520 44" stroke="#4b7bec" stroke-width="1.5" fill="none"/>
  <path d="M 110 87 L 520 86" stroke="#4b7bec" stroke-width="1.5" fill="none"/>
  <path d="M 110 92 L 520 128" stroke="#4b7bec" stroke-width="1.5" fill="none"/>
  <circle r="3.5" fill="#4b7bec"><animateMotion dur="1.5s" repeatCount="indefinite" path="M 110 87 L 520 86"/></circle>
  <circle r="3.5" fill="#1f9d6b"><animateMotion dur="1.5s" begin="0.75s" repeatCount="indefinite" path="M 520 86 L 110 87"/></circle>
  <text class="s" x="300" y="66" text-anchor="middle">probe request on every channel</text>
  <text class="k" x="14" y="166">The CLIENT chooses which AP to join. Not the WLC, not you.</text>
</svg>
<p class="walk-say"><span class="walk-title">The client decides, and its logic is its own</span>
A client sends <b>probe requests</b> across the channels and collects probe responses. Then it picks one — using an algorithm that is <b>entirely up to the vendor</b> and usually weighted far too heavily toward raw signal strength.
<br><br>This is why a laptop clings to a distant AP at 2 Mbps while a perfectly good one sits overhead. <b>The infrastructure can only influence the decision, never make it</b> — by trimming power so the distant AP is not heard, by disabling low data rates so the client is forced to look elsewhere, or by nudging it with 802.11k/v. That is the whole toolkit.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Open system authentication then association then the four way handshake before any data flows">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .ok{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <defs><marker id="wm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="f" x="14" y="36" width="126" height="32"/><text class="m" x="77" y="57" text-anchor="middle">Authentication</text>
  <line x1="144" y1="52" x2="168" y2="52" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#wm)"/>
  <rect class="f" x="172" y="36" width="126" height="32"/><text class="m" x="235" y="57" text-anchor="middle">Association</text>
  <line x1="302" y1="52" x2="326" y2="52" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#wm)"/>
  <rect class="ok" x="330" y="36" width="140" height="32"/><text class="m" x="400" y="57" text-anchor="middle">4-way handshake</text>
  <line x1="474" y1="52" x2="498" y2="52" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#wm)"/>
  <rect class="ok" x="502" y="36" width="124" height="32"/><text class="m" x="564" y="57" text-anchor="middle">data</text>
  <text class="s" x="77" y="84" text-anchor="middle">open — a formality</text>
  <text class="s" x="235" y="84" text-anchor="middle">gets an AID</text>
  <text class="s" x="400" y="84" text-anchor="middle">where keys happen</text>
  <text class="k" x="14" y="122">&#8220;802.11 Authentication&#8221; authenticates nothing. It is a leftover from WEP.</text>
  <text class="s" x="14" y="146">On any modern network it is Open System — both sides say yes unconditionally. The real</text>
  <text class="s" x="14" y="162">authentication is the 4-way handshake, or 802.1X before it.</text>
  <text class="s" x="14" y="188">A client stuck &#8220;associated but no IP&#8221; has usually failed the handshake — wrong PSK, or RADIUS.</text>
</svg>
<p class="walk-say"><span class="walk-title">Two formalities, then the part that matters</span>
<b>Authentication</b> in 802.11 terms is Open System: a request, a success, and nothing verified. <b>Association</b> assigns an association ID and binds the client to that BSSID. Neither step involves a password.
<br><br>Then comes the <b>4-way handshake</b>, where keys are derived and the client proves it knows the passphrase. A client that associates and then goes nowhere has failed here — and because association succeeded, the client UI often shows "connected" while nothing works.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CSMA/CA makes every station wait and back off before transmitting so airtime is shared">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv5 .tx{fill:#4b7bec}.sv5 .wait{fill:#E4E4E9}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">ONE CHANNEL, THREE CLIENTS — ONLY ONE TALKS AT A TIME</text>
  <text class="m" x="14" y="46">A</text><rect class="tx" x="40" y="34" width="90" height="16"/><rect class="wait" x="130" y="34" width="200" height="16"/><rect class="tx" x="330" y="34" width="60" height="16"/><rect class="wait" x="390" y="34" width="236" height="16"/>
  <text class="m" x="14" y="72">B</text><rect class="wait" x="40" y="60" width="90" height="16"/><rect class="tx" x="130" y="60" width="110" height="16"/><rect class="wait" x="240" y="60" width="386" height="16"/>
  <text class="m" x="14" y="98">C</text><rect class="wait" x="40" y="86" width="200" height="16"/><rect class="tx" x="240" y="86" width="90" height="16"/><rect class="wait" x="330" y="86" width="296" height="16"/>
  <text class="s" x="14" y="124">blue = transmitting     grey = waiting</text>
  <text class="k" x="14" y="152">A slow client hurts everyone, because it holds the channel longer for the same data.</text>
  <text class="s" x="14" y="176">One 802.11b device at 1 Mbps can consume more airtime sending an email than ten fast clients</text>
  <text class="s" x="14" y="192">sending video. This is the &#8220;slow client&#8221; problem, and it is why low data rates get disabled.</text>
</svg>
<p class="walk-say"><span class="walk-title">Airtime is the currency, not bandwidth</span>
Before transmitting, a station listens, waits a fixed interval, then waits a <b>random</b> additional period. That randomness is what stops two stations that were both waiting from starting simultaneously. Every frame is acknowledged, and an unacknowledged frame is retried.
<br><br>The consequence people miss: <b>what is shared is time, not bits</b>. A client at 6 Mbps takes ten times as long to send the same frame as one at 60 Mbps, and during that time nobody else can transmit. <b>One slow client degrades every other client on the channel</b> — which is why disabling the lowest data rates is one of the highest-value changes you can make to a busy network.</p>
</div>
</div>
</div>

---

## The beacon, in bytes

<div class="cap">
<div class="cap-head">Capture · 802.11 Beacon <span class="cap-filter">wlan.fc.type_subtype == 8</span></div>
<div class="cap-hex"><pre>0000  <mark>80 00</mark> 00 00 <mark>ff ff ff ff  ff ff</mark> 00 aa bb cc dd 01   ................
0010  00 aa bb cc dd 01 a0 30  5e 4d 3c 2b 1a 00 00 00   .......0^M&lt;+....
0020  <mark>64 00</mark> 31 04 <mark>00 09</mark> 43 4f  52 50 2d 57 49 46 49 01   d.1...<mark>CORP-WIFI</mark>.
0030  08 82 84 8b 96 0c 12 18  24 <mark>03 01 06</mark> 05 04 00 01   ........$.......
0040  00 00 <mark>30 14</mark> 01 00 00 0f  ac 04 01 00 00 0f ac 04   ..0.............
0050  01 00 <mark>00 0f ac 02</mark> 0c 00                             ........</pre></div>
<div class="cap-note">
<b>80 00</b> — type 0 (management), subtype 8 (beacon). <b>ff ff ff ff ff ff</b> — broadcast destination, which is why every client in range sees it without asking.<br>
<b>64 00</b> = beacon interval 100 TU = <b>102.4 ms</b>. <b>00 09</b> = tag 0 (SSID), 9 bytes, then <code>CORP-WIFI</code> <b>in plain ASCII</b>. <b>03 01 06</b> = DS Parameter Set, one byte, <b>channel 6</b>.<br>
<b>30 14</b> opens the RSN information element — 20 bytes describing the security: group cipher <code>00-0f-ac-04</code> (CCMP), pairwise <code>00-0f-ac-04</code> (CCMP), and AKM <b><code>00-0f-ac-02</code> = PSK</b>. Change that last suite to <code>-01</code> and it is 802.1X instead.<br>
<b>Everything a client needs to decide whether it can join is in this one frame</b> — which is also everything an attacker needs to know what your network runs, before authenticating to anything.
</div>
</div>

---

## Architectures, and what actually runs where

<figure class="fig">
<svg class="sv6" viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Autonomous access points versus lightweight access points with a controller versus cloud managed">
  <style>.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .n{fill:#17171A}.sv6 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9.5px;font-weight:700}.sv6 .b{fill:#F1EEE9;stroke:#B5B5BC}.sv6 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}
  </style>
  <text class="hdr" x="14" y="18">AUTONOMOUS</text>
  <rect class="b" x="14" y="26" width="196" height="96"/>
  <rect class="n" x="30" y="40" width="58" height="22" rx="2"/><text class="nt" x="59" y="55" text-anchor="middle">AP</text>
  <rect class="n" x="96" y="40" width="58" height="22" rx="2"/><text class="nt" x="125" y="55" text-anchor="middle">AP</text>
  <text class="s" x="30" y="80">Each AP is a full device.</text>
  <text class="s" x="30" y="95">Configure every one</text>
  <text class="s" x="30" y="110">by hand. No roaming help.</text>
  <text class="hdr" x="222" y="18">SPLIT-MAC + WLC</text>
  <rect class="b" x="222" y="26" width="196" height="96"/>
  <rect class="n" x="238" y="40" width="50" height="20" rx="2"/><text class="nt" x="263" y="54" text-anchor="middle">AP</text>
  <rect class="n" x="296" y="40" width="50" height="20" rx="2"/><text class="nt" x="321" y="54" text-anchor="middle">AP</text>
  <rect class="n" x="264" y="74" width="80" height="22" rx="2" fill="#B80027"/><text class="nt" x="304" y="89" text-anchor="middle">WLC</text>
  <line x1="263" y1="60" x2="290" y2="74" stroke="#8A8A93" stroke-width="1.5" stroke-dasharray="3 3"/>
  <line x1="321" y1="60" x2="318" y2="74" stroke="#8A8A93" stroke-width="1.5" stroke-dasharray="3 3"/>
  <text class="s" x="238" y="112">CAPWAP tunnels · one config</text>
  <text class="hdr" x="430" y="18">CLOUD / EMBEDDED</text>
  <rect class="b" x="430" y="26" width="196" height="96"/>
  <rect class="n" x="446" y="40" width="50" height="20" rx="2"/><text class="nt" x="471" y="54" text-anchor="middle">AP</text>
  <rect class="n" x="504" y="40" width="50" height="20" rx="2"/><text class="nt" x="529" y="54" text-anchor="middle">AP</text>
  <text class="s" x="446" y="80">Management in the cloud,</text>
  <text class="s" x="446" y="95">or a controller embedded</text>
  <text class="s" x="446" y="110">in a switch (EWC).</text>
  <rect x="14" y="138" width="612" height="66" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="158" fill="#2f5fd0">Split-MAC: the AP keeps what must happen in microseconds.</text>
  <text class="s" x="26" y="178">AP handles beacons, acknowledgements, encryption and the contention timing. The WLC handles</text>
  <text class="s" x="26" y="194">associations, authentication, roaming decisions, RF management and policy.</text>
  <rect x="14" y="216" width="612" height="72" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="236" fill="#0f6b47">CAPWAP is two tunnels: control on UDP 5246, data on UDP 5247.</text>
  <text class="s" x="26" y="256">Control is DTLS-encrypted by default; data is not, unless you turn it on. In Local mode all client</text>
  <text class="s" x="26" y="272">traffic rides the data tunnel back to the WLC — <tspan font-weight="700">including a branch PC printing to the printer beside it.</tspan></text>
  <text class="s" x="26" y="286">That hairpin is exactly what FlexConnect exists to avoid.</text>
</svg>
<figcaption><b>Figure 2.</b> The controller did not make APs smarter — it moved the slow decisions somewhere they can be made once for the whole network.</figcaption>
</figure>

<div class="why">
<b>The AP gets its address, then has to find a controller</b>
An AP boots, takes a DHCP address, and then must <b>discover</b> a WLC. It tries, in order: a controller it remembers, a local broadcast, <b>DHCP option 43</b>, a DNS lookup of <code>CISCO-CAPWAP-CONTROLLER.localdomain</code>, and any statically primed address.
<br><br>Which is why <b>an AP that gets an IP and then does nothing</b> is nearly always option 43 or DNS — not a cabling or power fault. Check discovery before anything else.
<br><br>And the physical side: an AP needs <b>PoE</b> (802.3af is often not enough — 802.3at or 802.3bt for modern APs, or the radios quietly run degraded), and its switch port is an <b>access port</b> in Local mode but a <b>trunk</b> in FlexConnect, because the AP is putting locally switched traffic into several VLANs itself.
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>WLC — the four commands that answer most questions</div>
<pre><span class="p">WLC#</span> <span class="c">show ap summary</span>
Number of APs: 3
AP Name    Slots  AP Model      Ethernet MAC    Location   Country  State
---------  -----  ------------  --------------  ---------  -------  --------
AP-FL1-01      2  C9120AXI-E    00aa.bbcc.dd01  Floor-1    GB       <span class="g">Registered</span>
AP-FL1-02      2  C9120AXI-E    00aa.bbcc.dd02  Floor-1    GB       <span class="g">Registered</span>
AP-BR2-01      2  C9115AXI-E    00aa.bbcc.dd03  Branch-2   GB       <span class="r">Not Joined</span>

<span class="o">! "Not Joined" with a valid IP = discovery. Option 43, DNS, or a blocked UDP 5246.</span>

<span class="p">WLC#</span> <span class="c">show ap dot11 24ghz summary</span>
AP Name     Chan  TxPwr  Clients  Util  Noise  Interference
----------  ----  -----  -------  ----  -----  ------------
AP-FL1-01      <span class="y">6</span>    1/22        14   <span class="r">78%</span>   -89              <span class="r">31%</span>
AP-FL1-02     <span class="y">11</span>    2/20         9   42%   -91               8%

<span class="o">! Channel utilisation 78% is the number that matters. Above ~50% users feel it,</span>
<span class="o">! and no amount of extra signal strength will fix it.</span>

<span class="p">WLC#</span> <span class="c">show wireless client summary</span>
MAC             AP Name      WLAN  State     Protocol  Method
--------------  -----------  ----  --------  --------  ----------
1122.3344.556f  AP-FL1-01       3  <span class="g">Run</span>       11ax(5)   PSK
aabb.ccdd.1234  AP-FL1-01       3  <span class="r">Authenticating</span> 11n(2.4) PSK

<span class="o">! Stuck in "Authenticating" on a PSK network = wrong passphrase, almost always.</span>
<span class="o">! On 802.1X it means RADIUS. "Run" is the only state that means working.</span>

<span class="p">WLC#</span> <span class="c">show wireless client mac-address 1122.3344.556f detail | include RSSI|SNR|Rate</span>
        Radio Signal Strength Indicator............ <span class="g">-58 dBm</span>
        Signal to Noise Ratio...................... <span class="g">33 dB</span>
        Current Rate............................... m9 ss2

<span class="o">! RSSI better than -67 dBm and SNR above 25 dB is the healthy target.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Channel utilisation is the number to look at first</b>, and it is the one nobody checks. A client at −58 dBm on a channel that is 78% busy will have a terrible experience, and every signal-strength metric on the dashboard will look excellent while it does.</p>

<div class="real">
<b>In the real world</b>
The complaint is always "the Wi-Fi is slow". The cause is usually one of four things, in this order: <b>channel utilisation</b> from too many clients or neighbouring networks; <b>2.4 GHz</b> being used at all in a dense space; <b>low data rates still enabled</b>, so one distant client hogs airtime; or <b>a client that will not roam</b> and is clinging to an AP two floors away.
<br><br>None of those is fixed by more signal. Three of them are made <i>worse</i> by more signal. The instinct to turn the power up is almost always wrong, and it is the first thing most people try.
</div>

---

## What goes wrong

**AP gets an IP and never joins.** Discovery — DHCP option 43, DNS, or UDP 5246 blocked.

**AP joins but radios are down.** Insufficient PoE, or a country/regulatory domain mismatch.

**Clients associate then fail.** Wrong PSK, or RADIUS unreachable. Check client state, not signal.

**Great signal, terrible speed.** Channel utilisation. Look at the airtime, not the dBm.

**One client kills the cell.** Low data rates enabled; a slow client holds the channel.

**Branch traffic hairpins over the WAN.** Local mode. Use FlexConnect with local switching.

**FlexConnect AP works, VLANs do not.** Its switch port needs to be a trunk.

---

<div class="lab">
<div class="lab-head">Lab — capture the join, then prove the power myth wrong</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Capture a real 802.11 join from beacon to data and identify each frame. Read the security configuration straight out of a beacon without connecting. Then measure what actually limits throughput — by adding a slow client, and by turning the power up and watching it get worse.</div>

**Setup.** A Wi-Fi adapter that supports **monitor mode** (an Alfa AWUS036 or similar; the built-in adapter on macOS can do it via `airport -I` and Wireshark), plus a WLC or a home AP you control. Everything here is capture-only on **your own network**.

<p class="lab-step"><span class="n">1</span>Put an adapter in monitor mode and watch the beacons</p>

```bash
sudo airport en0 sniff 6      # macOS, channel 6
# or Linux:
sudo iw dev wlan0 set type monitor && sudo tcpdump -i wlan0 -w wifi.pcap
```

Filter in Wireshark: `wlan.fc.type_subtype == 8`

<div class="lab-watch"><b>Things to notice</b>
Beacons from <b>every</b> network in range, roughly ten per second each. Expand one and find the SSID tag, the DS Parameter Set (the channel) and the <b>RSN Information Element</b>.
<br><br>Read the AKM suite: <code>00-0f-ac-02</code> is PSK, <code>00-0f-ac-01</code> is 802.1X. <b>You now know how every network around you authenticates, without touching any of them.</b> Then count how many distinct networks share channel 6 — that is your interference, and it is not yours to fix.</div>

<p class="lab-step"><span class="n">2</span>Capture a full join</p>

Start the capture, then connect a phone to your own SSID.

<div class="lab-watch"><b>Things to notice</b>
Filter `wlan.addr == <your phone MAC>` and read the sequence: <b>probe request → probe response → authentication ×2 → association request → association response → EAPOL ×4 → data</b>.
<br><br>Open the Authentication frames and confirm the algorithm is <b>Open System</b> with a success status — <b>nothing was authenticated</b>. Then find the four EAPOL-Key frames, which is where the real work happens.
<br><br>Now type the passphrase wrong deliberately and capture again: association still succeeds, and the handshake fails. <b>The client shows "connected" for a moment on a network it cannot use.</b></div>

<p class="lab-step"><span class="n">3</span>Prove that channels beat power</p>

Put two APs on **the same channel**, measure throughput on both simultaneously with `iperf3`. Then move one to a different non-overlapping channel and repeat.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>No difference</b> — the APs cannot hear each other, so they were never contending. Move them closer.</li>
<li><b>Both are slow either way</b> — a neighbouring network is saturating the channel. Check utilisation, and try 5 GHz.</li>
<li><b>Only one client available</b> — you need simultaneous load on both to see contention at all.</li>
</ul>
Aggregate throughput should roughly <b>double</b> on separate channels. Then put one on a <b>partially overlapping</b> channel — 3 or 4 — and measure again: <b>worse than sharing a channel</b>, because now they interfere instead of taking turns. That single measurement is the whole argument for 1, 6 and 11.</div>

<p class="lab-step"><span class="n">4</span>Make one slow client ruin it for everyone</p>

With two clients on one AP, force one to 2.4 GHz at a low rate — move it far away, or disable its 5 GHz radio.

<div class="lab-watch"><b>Things to notice</b>
Run <code>iperf3</code> on the fast client alone, then again while the slow one transfers. <b>The fast client's throughput collapses far more than "sharing" would explain</b>, because airtime is what is shared and the slow client consumes it disproportionately.
<br><br>Then disable rates below 12 Mbps on the SSID and repeat. The distant client may drop off entirely — <b>and that is the intended outcome</b>. It is pushed to a nearer AP, and everyone else gets their airtime back.</div>

<p class="lab-step"><span class="n">5</span>Turn the power up and watch it get worse</p>

Set both APs to maximum transmit power, with clients loading both.

<div class="lab-watch"><b>Things to notice</b>
Signal strength improves everywhere. <b>Aggregate throughput drops.</b> Each AP now hears the other, so they defer to each other constantly, and clients still cannot transmit back any louder than they could before.
<br><br>Drop both to a low power and measure again. <b>You have just demonstrated the single most common wireless design mistake</b>, with numbers, on your own equipment.</div>

<div class="lab-earned"><b>What you earned</b>
You can read a beacon and state a network's channel, name and security without connecting to it. You can identify every frame in a join and explain why 802.11 Authentication authenticates nothing. You have measured that non-overlapping channels roughly double capacity, that partially overlapping ones are worse than sharing, and that one slow client costs more airtime than its share. And you have turned the power up and watched throughput fall — so the next time somebody suggests it, you will have the numbers.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Why are only channels 1, 6 and 11 used in 2.4 GHz?</p>
<label class="qz-opt"><input type="radio" name="wq1"><span>They are the only non-overlapping 20 MHz channels, so APs can take turns instead of interfering</span><em class="qz-fb qz-good">Correct — partially overlapping channels cannot hear each other properly, so CSMA/CA breaks and both perform worse than sharing one channel.</em></label>
<label class="qz-opt"><input type="radio" name="wq1"><span>They have the longest range</span><em class="qz-fb qz-bad">Range is the same across the band.</em></label>
<label class="qz-opt"><input type="radio" name="wq1"><span>Other channels are not legal</span><em class="qz-fb qz-bad">They are legal, just unusable in practice alongside neighbours.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>An AP has an IP address but shows "Not Joined". What do you check first?</p>
<label class="qz-opt"><input type="radio" name="wq2"><span>Controller discovery — DHCP option 43, DNS, or UDP 5246 being blocked</span><em class="qz-fb qz-good">Correct. It has an address, so the physical and DHCP path already work. Discovery is the next link in the chain.</em></label>
<label class="qz-opt"><input type="radio" name="wq2"><span>PoE budget</span><em class="qz-fb qz-bad">Worth checking, but it booted and got an address, so it has power.</em></label>
<label class="qz-opt"><input type="radio" name="wq2"><span>The SSID configuration</span><em class="qz-fb qz-bad">SSIDs come from the WLC — which it has not reached.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Which AP mode lets a branch keep working when the WAN to the controller fails?</p>
<label class="qz-opt"><input type="radio" name="wq3"><span>FlexConnect</span><em class="qz-fb qz-good">Correct — it switches client traffic locally instead of tunnelling it back, and its switch port must be a trunk.</em></label>
<label class="qz-opt"><input type="radio" name="wq3"><span>Local</span><em class="qz-fb qz-bad">Local mode tunnels all client traffic to the WLC, which is the thing that breaks.</em></label>
<label class="qz-opt"><input type="radio" name="wq3"><span>Monitor</span><em class="qz-fb qz-bad">Monitor mode serves no clients at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A client shows −55 dBm and users still complain of slowness. What do you look at?</p>
<label class="qz-opt"><input type="radio" name="wq4"><span>Channel utilisation — airtime is shared, and signal strength says nothing about how busy the channel is</span><em class="qz-fb qz-good">Correct. Above roughly 50% utilisation users feel it, no matter how strong the signal.</em></label>
<label class="qz-opt"><input type="radio" name="wq4"><span>Increase AP transmit power</span><em class="qz-fb qz-bad">The signal is already excellent, and more power increases contention.</em></label>
<label class="qz-opt"><input type="radio" name="wq4"><span>Move the client closer</span><em class="qz-fb qz-bad">Distance is not the constraint at −55 dBm.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What does 802.11 Open System Authentication actually verify?</p>
<label class="qz-opt"><input type="radio" name="wq5"><span>Nothing — it is a legacy formality, and real authentication happens in the 4-way handshake or 802.1X</span><em class="qz-fb qz-good">Correct, which is why a client can "authenticate", associate, and still fail to pass any traffic.</em></label>
<label class="qz-opt"><input type="radio" name="wq5"><span>The pre-shared key</span><em class="qz-fb qz-bad">That is proven in the 4-way handshake, after association.</em></label>
<label class="qz-opt"><input type="radio" name="wq5"><span>The client certificate</span><em class="qz-fb qz-bad">That is EAP-TLS, which runs after association.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Which two UDP ports does CAPWAP use?</p>
<label class="qz-opt"><input type="radio" name="wq6"><span>5246 control (DTLS by default) and 5247 data</span><em class="qz-fb qz-good">Correct. Data-plane encryption is optional and off unless enabled.</em></label>
<label class="qz-opt"><input type="radio" name="wq6"><span>1812 and 1813</span><em class="qz-fb qz-bad">Those are RADIUS.</em></label>
<label class="qz-opt"><input type="radio" name="wq6"><span>12222 and 12223</span><em class="qz-fb qz-bad">Those were LWAPP, the predecessor.</em></label>
</div>

---

## References

- **IEEE 802.11-2020** — the standard itself; the frame formats in this article come from it.
- **RFC 5415** — *CAPWAP Protocol Specification*.
- Cisco — [Catalyst 9800 Series Configuration Guide](https://www.cisco.com/c/en/us/support/wireless/catalyst-9800-series-wireless-controllers/products-installation-and-configuration-guides-list.html)
- Cisco — [Wireless LAN Design Guide (CVD)](https://www.cisco.com/c/en/us/solutions/design-zone/networking-design-guides.html) — the capacity-versus-coverage arguments in detail.

---

*Related: [WLAN security: WPA2, WPA3 and the 4-way handshake](/blog/wlan-security-wpa2-wpa3-and-the-four-way-handshake) · [EAP-TLS frame by frame](/blog/eap-tls-explained-frame-by-frame) · [AAA: RADIUS and TACACS+](/blog/aaa-radius-tacacs-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
