---
title: "WLAN Security: The 4-Way Handshake, and Why WPA3 Had to Exist"
excerpt: "The passphrase is never sent over the air — both sides derive the same key independently and prove it with a signature. That design is elegant, and it has one flaw: everything needed to guess the passphrase offline is captured in four frames. WPA3 exists to close exactly that."
date: "2026-09-21"
tags: ["Wireless", "WPA2", "WPA3", "802.1X", "Security", "WLC", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 5.9 *Describe wireless security protocols (WPA, WPA2, and WPA3)*, 5.10 *Configure and verify WLAN within the GUI using WPA2 PSK*, 2.9 *Interpret the wireless LAN GUI configuration for client connectivity*.

## Cheat sheet

| | Encryption | Integrity | Status |
|---|---|---|---|
| **WEP** | RC4, 24-bit IV | CRC-32 | **Broken.** Recoverable in minutes |
| **WPA** | TKIP (RC4) | Michael | **Deprecated** |
| **WPA2** | **CCMP (AES)** | CBC-MAC | The current baseline |
| **WPA3** | **GCMP-256 / CCMP** | **SAE**, PMF mandatory | What you deploy now |

| Mode | Authentication | Use |
|---|---|---|
| **Personal (PSK)** | Everyone shares one passphrase | Home, guest, IoT |
| **Enterprise (802.1X)** | **Per-user** credentials via RADIUS | Anything corporate |
| **WPA3-SAE** | Per-user key from a shared passphrase — **no offline attack** | Replaces WPA2-PSK |
| **OWE** | Encryption with **no** password | Open/guest networks |

| The 4 keys | From | Does |
|---|---|---|
| **PMK** | PBKDF2(passphrase, SSID, 4096) or from 802.1X | The root |
| **PTK** | PRF(PMK, MACs + both nonces) | Splits into the three below |
| **KCK** | PTK[0:16] | Signs the MIC |
| **KEK** | PTK[16:32] | Encrypts the GTK |
| **TK** | PTK[32:48] | **Encrypts your actual data** |

**The sentence that makes the handshake make sense.** The passphrase is **never transmitted**. Both sides already know it, both derive the same PTK from it plus two random nonces, and the MIC proves they arrived at the same answer. Nothing secret crosses the air — **but the nonces and the MIC do, and that is enough to test guesses offline.**

---

## The 4-way handshake

<div class="walk">
<div class="walk-head">Four frames, and what each one proves <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="hsw" id="hs1" checked><label for="hs1"><span class="step-n">1</span>PMK</label>
  <input type="radio" name="hsw" id="hs2"><label for="hs2"><span class="step-n">2</span>M1 and M2</label>
  <input type="radio" name="hsw" id="hs3"><label for="hs3"><span class="step-n">3</span>M3 and M4</label>
  <input type="radio" name="hsw" id="hs4"><label for="hs4"><span class="step-n">4</span>The flaw</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv1" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The pairwise master key is derived from the passphrase and the SSID used as salt">
  <style>.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv1 .ok{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <defs><marker id="hm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="f" x="14" y="34" width="150" height="32"/><text class="m" x="89" y="55" text-anchor="middle">passphrase</text>
  <rect class="f" x="174" y="34" width="150" height="32"/><text class="m" x="249" y="55" text-anchor="middle">SSID (the salt)</text>
  <line x1="170" y1="76" x2="200" y2="96" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#hm)"/>
  <text class="m" x="340" y="55">PBKDF2-SHA1, 4096 iterations</text>
  <rect class="ok" x="14" y="104" width="612" height="32"/>
  <text class="m" x="26" y="125">PMK = 9f b7 81 96 8f 1a d2 15 92 6b 61 2a f1 9d 0c f9 …  (32 bytes)</text>
  <text class="k" x="14" y="164">The SSID is the salt — so the same passphrase on a different SSID gives a different PMK.</text>
  <text class="s" x="14" y="186">Which is why rainbow tables are built per SSID, and why &#8220;linksys&#8221; or &#8220;BTHub&#8221; are pre-computed already.</text>
</svg>
<p class="walk-say"><span class="walk-title">The root key, and the reason your SSID name matters</span>
For WPA2-Personal the PMK is <code>PBKDF2-SHA1(passphrase, <b>SSID</b>, 4096 iterations, 32 bytes)</code>. Deliberately slow, to make guessing expensive.
<br><br>The SSID is the salt. <b>A common SSID name has pre-computed tables available for it</b> — so leaving an AP on its factory network name measurably weakens the passphrase, before anyone has attacked anything.
<br><br>For WPA2-<b>Enterprise</b> there is no passphrase at all: the PMK comes out of the 802.1X exchange and is <b>different for every user and every session</b>. That single difference removes the entire offline-attack problem.</p>
</div>
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Message one carries the AP nonce and message two returns the client nonce with a signature">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect class="n" x="20" y="60" width="90" height="30" rx="3"/><text class="nt" x="65" y="80" text-anchor="middle">AP</text>
  <rect class="n" x="520" y="60" width="96" height="30" rx="3"/><text class="nt" x="568" y="80" text-anchor="middle">client</text>
  <path d="M 110 52 L 520 52" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 110 52 L 520 52"/></circle>
  <text class="m" x="315" y="44" text-anchor="middle">M1:  ANonce          (no MIC — client has no key yet)</text>
  <path d="M 520 100 L 110 100" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 520 100 L 110 100"/></circle>
  <text class="m" x="315" y="118" text-anchor="middle" fill="#0f6b47">M2:  SNonce  +  MIC = HMAC-SHA1(KCK, frame)</text>
  <text class="k" x="14" y="152">After M2 both sides have everything: two MACs, two nonces, the PMK.</text>
  <text class="s" x="14" y="176">Each computes the PTK independently. The AP recomputes M2's MIC with its own KCK — if it matches,</text>
  <text class="s" x="14" y="192">the client has the right passphrase. <tspan font-weight="700">That is the whole proof, and nothing secret was sent.</tspan></text>
</svg>
<p class="walk-say"><span class="walk-title">Two random numbers, one shared answer</span>
<b>M1</b> carries the AP's nonce with a MIC field of all zeros — the client cannot sign anything yet. <b>M2</b> carries the client's nonce <i>and</i> a MIC computed with the KCK it has just derived.
<br><br>PTK = PRF(PMK, "Pairwise key expansion", both MACs + both nonces). Because the nonces are fresh each time, <b>the same passphrase produces a different PTK on every connection</b> — so capturing today's traffic tells you nothing about yesterday's.
<br><br>The AP verifies M2's MIC using its own independently derived KCK. Match means the client knew the passphrase. <b>Nothing was transmitted that reveals it.</b></p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Message three delivers the group key encrypted and message four confirms installation">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}</style>
  <rect class="n" x="20" y="60" width="90" height="30" rx="3"/><text class="nt" x="65" y="80" text-anchor="middle">AP</text>
  <rect class="n" x="520" y="60" width="96" height="30" rx="3"/><text class="nt" x="568" y="80" text-anchor="middle">client</text>
  <path d="M 110 52 L 520 52" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 110 52 L 520 52"/></circle>
  <text class="m" x="315" y="44" text-anchor="middle">M3:  GTK encrypted with KEK  +  MIC</text>
  <path d="M 520 100 L 110 100" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 520 100 L 110 100"/></circle>
  <text class="m" x="315" y="118" text-anchor="middle" fill="#0f6b47">M4:  acknowledgement — keys installed</text>
  <text class="k" x="14" y="152">The GTK is the shared key for broadcast and multicast — every client gets the same one.</text>
  <text class="s" x="14" y="178">Which is why a client on your WLAN can decrypt broadcast traffic from every other client, and why</text>
  <text class="s" x="14" y="194">the GTK is rotated when someone leaves. Unicast uses the per-client TK and is not shared.</text>
</svg>
<p class="walk-say"><span class="walk-title">The group key, and then it is done</span>
<b>M3</b> delivers the <b>GTK</b> — the group temporal key used for broadcast and multicast — encrypted with the KEK, plus its own MIC. <b>M4</b> is the client confirming installation.
<br><br>Unicast data then uses the client's own <b>TK</b>, unique per client. Broadcast uses the GTK, which <b>every client on the WLAN shares</b> — so on a PSK network a connected device can decrypt broadcast traffic from all the others. Enterprise networks rotate the GTK when clients leave for exactly this reason.
<br><br>M4 is also where <b>KRACK</b> lived: replaying M3 caused some clients to reinstall the TK and reset the packet counter, breaking the cipher. Patched everywhere now, and it is the reason WPA3 makes protected management frames mandatory.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Capturing the handshake lets an attacker test passphrase guesses offline which WPA3 SAE prevents">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .bad{fill:rgba(211,0,45,.10);stroke:#D3002D}.sv4 .ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}</style>
  <rect class="bad" x="14" y="26" width="612" height="80"/>
  <text class="k" x="26" y="48" fill="#B80027">WPA2-PSK: the four frames contain everything needed to test a guess.</text>
  <text class="m" x="26" y="70">ANonce + SNonce + both MACs + the MIC  — all in the clear</text>
  <text class="s" x="26" y="92">Guess a passphrase → derive PMK → derive PTK → compute MIC → compare. Offline, at millions per second.</text>
  <rect class="ok" x="14" y="122" width="612" height="80"/>
  <text class="k" x="26" y="144" fill="#0f6b47">WPA3-SAE: a guess cannot be tested without talking to the AP again.</text>
  <text class="m" x="26" y="166">Dragonfly key exchange — each attempt needs a fresh live interaction</text>
  <text class="s" x="26" y="188">So the attack becomes online and rate-limited, and captured traffic stays private even if the</text>
  <text class="s" x="26" y="200">passphrase is later discovered. That property is <tspan font-weight="700">forward secrecy</tspan>.</text>
</svg>
<p class="walk-say"><span class="walk-title">Why WPA3 had to exist</span>
The handshake reveals nothing directly — but it hands an attacker a <b>verifier</b>. Capture four frames (or deauthenticate a client to force them), then test guesses offline at enormous speed. <b>The only defence in WPA2-PSK is passphrase length</b>, and human-chosen passphrases are usually not long enough.
<br><br><b>WPA3 replaces PSK with SAE</b> (Simultaneous Authentication of Equals, the Dragonfly exchange). A guess can only be tested by interacting with the AP again, so attempts become online and rate-limited. It also gives <b>forward secrecy</b>: capture traffic today, learn the passphrase next year, and you still cannot decrypt what you captured.
<br><br>WPA3 additionally makes <b>PMF</b> mandatory, which signs management frames and kills the deauthentication attack used to force a handshake in the first place.</p>
</div>
</div>
</div>

---

## The handshake, in bytes

<div class="cap">
<div class="cap-head">Capture · EAPOL-Key M2 <span class="cap-filter">eapol</span></div>
<div class="cap-hex"><pre>0000  <mark>02 03</mark> 00 5f <mark>02</mark> <mark>01 0a</mark> 00  10 00 00 00 00 00 00 00   ..._............
0010  01 <mark>a1 b2 c3 d4 e5 f6 07  18 29 3a 4b 5c 6d 7e 8f</mark>   .........):K\m~.
0020  <mark>90 11 22 33 44 55 66 77  88 99 aa bb cc dd ee ff</mark>   .."3DUfw........
0030  <mark>00</mark> 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00   ................
0040  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00   ................
0050  00 <mark>ed 91 91 18 03 ec 2f  fc a8 aa be 27 ea 3f aa</mark>   ......./....'.?.
0060  <mark>04</mark> 00 00                                            ...</pre></div>
<div class="cap-note">
<b>02 03</b> — 802.1X-2004, type 3 (EAPOL-Key). <b>02</b> — RSN key descriptor. <b>01 0a</b> — key information: pairwise, <b>MIC bit set</b>, key descriptor version 2 (AES / HMAC-SHA1). In M1 this field reads <code>00 8a</code> and the MIC bit is clear.<br>
Offset 0x11–0x30 is the <b>SNonce</b> — 32 random bytes the client chose. Offset 0x51–0x60 is the <b>MIC</b>: <code>ed91911803ec2ffca8aabe27ea3faa04</code>, computed as <code>HMAC-SHA1(KCK, this entire frame with the MIC field zeroed)</code> truncated to 16 bytes.<br>
With the passphrase <code>Str0ngWiFiPass</code> and SSID <code>CORP-WIFI</code>, the derivation runs: PMK <code>9fb78196…</code> → PTK → KCK <code>eae3fb9ed48269d8337ba89e019f0113</code> → <b>the MIC above, exactly</b>.<br>
<b>Everything in that derivation except the passphrase is visible in this capture.</b> That is the offline attack, stated as plainly as it can be — and the reason WPA3 exists.
</div>
</div>

---

## Configuring a WLAN — what the GUI is actually setting

<div class="cmd">
<div class="cmd-line"><span class="opt">! Catalyst 9800 — the CLI behind the GUI wizard</span>
<span class="t">wlan</span> <span class="opt">CORP-WIFI</span> <span class="opt">3</span> <span class="opt">CORP-WIFI</span>
 <span class="t">security wpa</span>
 <span class="t">security wpa wpa2</span>
 <span class="t">security wpa wpa2 ciphers aes</span>
 <span class="t">security wpa akm psk</span>
 <span class="t">security wpa akm psk set-key ascii</span> <span class="opt">0 &lt;passphrase&gt;</span>
 <span class="t">security pmf optional</span>
 <span class="t">no shutdown</span>
!
<span class="t">wireless profile policy</span> <span class="opt">POL-CORP</span>
 <span class="t">vlan</span> <span class="opt">20</span>
 <span class="t">no central switching</span>
 <span class="t">session-timeout</span> <span class="opt">86400</span>
 <span class="t">no shutdown</span>
!
<span class="t">wireless tag policy</span> <span class="opt">TAG-FL1</span>
 <span class="t">wlan</span> <span class="opt">CORP-WIFI</span> <span class="t">policy</span> <span class="opt">POL-CORP</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>wlan NAME id SSID</dt><dd>Three separate things and people conflate them. The <b>profile name</b> is internal, the <b>ID</b> is the index, and the <b>SSID</b> is what clients see. They are commonly set the same, which hides the distinction until the day it matters.</dd></div>
<div class="is-key"><dt>security wpa wpa2 <br>ciphers aes</dt><dd><b>AES (CCMP) only.</b> If TKIP is left enabled for one old device, <b>the whole WLAN drops to 802.11g rates</b> — 802.11n and later refuse to use TKIP. One legacy printer can halve the speed of the entire network, and nothing will tell you that is why.</dd></div>
<div><dt>akm psk / akm dot1x</dt><dd>The authentication method that appears in the beacon's RSN IE. <code>psk</code> = everyone shares a passphrase. <code>dot1x</code> = per-user via RADIUS, and no shared secret to leak.</dd></div>
<div class="is-key"><dt>security pmf</dt><dd>Protected Management Frames — signs management frames so <b>deauthentication attacks stop working</b>. <code>optional</code> for mixed clients, <code>required</code> where you can. <b>WPA3 makes it mandatory</b>, which is one of its biggest practical wins.</dd></div>
<div class="is-key"><dt>no shutdown <br>(on the WLAN)</dt><dd><b>A WLAN is created shut.</b> Everything is configured, the SSID does not appear, and the GUI shows the profile happily. It is the single most common "my new SSID is not broadcasting" cause.</dd></div>
<div class="is-key"><dt>policy profile + <br>policy tag</dt><dd><b>The 9800 model, and the thing that catches people moving from AireOS.</b> A WLAN is not live until a <b>policy profile</b> (which carries the VLAN) is bound to it in a <b>policy tag</b>, and that tag is applied to the APs. Miss the last step and the SSID exists on the controller and appears on no access point.</dd></div>
<div><dt>vlan 20</dt><dd>Set on the <b>policy profile</b>, not the WLAN. Wrong VLAN here is the usual cause of "associates fine, no DHCP".</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>WLC — client state is the whole diagnosis</div>
<pre><span class="p">WLC#</span> <span class="c">show wlan summary</span>
ID   Profile Name    SSID          Status   Security
---  --------------  ------------  -------  ----------------------------
3    CORP-WIFI       CORP-WIFI     <span class="g">UP</span>       [WPA2][PSK][AES]
4    GUEST           GUEST         <span class="r">DOWN</span>     [open]
                                   <span class="o">^^^^ created shut. "no shutdown" on the WLAN.</span>

<span class="p">WLC#</span> <span class="c">show wireless client mac-address 1122.3344.556f detail</span>
  Client MAC Address : 1122.3344.556f
  AP Name            : AP-FL1-01
  Wireless LAN Id    : 3
  <span class="y">Client State       : Associated</span>
  <span class="y">Policy Manager State: Webauth Pending</span>
  Protocol           : 802.11ax - 5 GHz
  Encryption Cipher  : CCMP (AES)
  <span class="y">Authentication Key Management : PSK</span>
  Client IPv4 Address : <span class="r">0.0.0.0</span>

<span class="o">! Associated but no IP. Either the handshake failed, or the policy profile</span>
<span class="o">! points at the wrong VLAN and DHCP never reaches it.</span>

<span class="p">WLC#</span> <span class="c">debug client 1122.3344.556f</span>
Association received from 1122.3344.556f on AP AP-FL1-01
<span class="g">Association success</span>
Starting key exchange to mobile 1122.3344.556f
Sending EAPOL-Key Message 1
Received EAPOL-Key from mobile — M2
<span class="r">EAPOL-Key MIC verification failed</span>            <span class="o">&lt;- wrong passphrase. Definitively.</span>
Deauthenticating mobile 1122.3344.556f, reason 15 (4-way handshake timeout)

<span class="o">! Reason 15 in a client log means exactly this. It is not a signal problem,</span>
<span class="o">! not a DHCP problem, and no amount of moving closer will fix it.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Read the client state, not the signal.</b> <code>Associated</code> means the radio link is fine and something after it failed. <code>Run</code> is the only state that means working. And <b>MIC verification failed</b> is one of the few genuinely unambiguous messages in networking — the passphrase is wrong, full stop.</p>

<div class="real">
<b>In the real world</b>
PSK's real weakness is not cryptographic — it is <b>operational</b>. One passphrase, shared with everyone, written on a whiteboard, still in a leaver's phone. Rotating it means touching every device, so nobody rotates it, so it is eventually everywhere.
<br><br>802.1X fixes that structurally: per-user credentials, revoked centrally, and nothing shared to leak. <b>The cost is RADIUS</b> — a dependency that, when it fails, takes down wireless for everyone at once. Which loops straight back to a method list with a working fallback and a tested failure path.
<br><br>For guest and IoT where PSK is unavoidable: a long random passphrase, an SSID that is not the factory name, PMF enabled, and WPA3 wherever the clients support it.
</div>

---

## What goes wrong

**New SSID does not broadcast.** WLAN created shut, or the policy tag was never applied to the APs.

**Associates, never gets an IP.** Handshake failed, or the policy profile has the wrong VLAN.

**Everything is slow after adding one old device.** TKIP enabled — the whole WLAN drops to 802.11g rates.

**Client connects on one AP but not another.** Different policy tags applied to different APs.

**Deauthentication attacks work.** PMF not enabled.

**802.1X fails for everyone at once.** RADIUS unreachable. Test with `test aaa` before blaming wireless.

**`reason 15` in client logs.** 4-way handshake timeout. The passphrase is wrong.

---

<div class="lab">
<div class="lab-head">Lab — capture a handshake, derive the keys yourself, then break TKIP's performance</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Capture a 4-way handshake on your own network and derive the PMK, PTK and MIC in Python — proving to yourself that the passphrase never crosses the air and that everything else does. Then build a WLAN from scratch and hit the two faults everybody hits. Finish by measuring what one TKIP client costs the whole SSID.</div>

**Setup.** A monitor-mode adapter, a WLC or AP **you own**, and Python. Everything here is against your own network only.

<p class="lab-step"><span class="n">1</span>Capture your own handshake</p>

```bash
sudo airport en0 sniff 36      # or iw/tcpdump on Linux
```

Connect a device, then filter `eapol` in Wireshark.

<div class="lab-watch"><b>Things to notice</b>
Four EAPOL-Key frames. Open M1 and M2 and compare the <b>Key Information</b> field — the MIC bit is clear in M1 and set in M2. Find the <b>ANonce</b> in M1 and the <b>SNonce</b> in M2.
<br><br>Search the entire capture for your passphrase. <b>It is not there, in any form.</b> That is the design working.</div>

<p class="lab-step"><span class="n">2</span>Derive the keys with your own code</p>

```python
import hashlib, hmac
pmk = hashlib.pbkdf2_hmac('sha1', PASSPHRASE, SSID, 4096, 32)
# PTK = PRF(pmk, b'Pairwise key expansion',
#           min(mac)+max(mac)+min(nonce)+max(nonce), 48)
# KCK = ptk[:16];  mic = hmac.new(KCK, m2_with_zeroed_mic, hashlib.sha1).digest()[:16]
```

<div class="lab-watch"><b>Things to notice</b>
Your computed MIC should <b>match the captured one byte for byte</b>. When it does, you have personally verified the whole scheme.
<br><br>Now change one character of the passphrase and recompute — completely different MIC. <b>That is the offline attack in two lines</b>: try a guess, compare, repeat. Time how many guesses per second you manage, then work out how long a dictionary would take against your real passphrase. That number is your actual security margin.</div>

<p class="lab-step"><span class="n">3</span>Build the WLAN and hit both classic faults</p>

Create a WPA2-PSK WLAN on the controller, but **do not** `no shutdown` it and **do not** apply the policy tag.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>SSID does not appear</b> — correct, twice over. Fix one fault at a time so you learn both symptoms.</li>
<li><b>Appears on some APs only</b> — the policy tag is applied to some and not others.</li>
<li><b>Appears but clients get no address</b> — the VLAN on the policy profile.</li>
</ul>
<code>show wlan summary</code> shows DOWN for the first fault. For the second it shows <b>UP</b> and the SSID still does not broadcast — <b>the controller looks entirely healthy</b>. That asymmetry is why the second one takes longer to find.</div>

<p class="lab-step"><span class="n">4</span>Type the passphrase wrong, and read the log</p>

```cisco
WLC# debug client <mac>
```

<div class="lab-watch"><b>Things to notice</b>
Association <b>succeeds</b>, then <b>EAPOL-Key MIC verification failed</b>, then deauthentication with <b>reason 15</b>.
<br><br>Meanwhile the client shows "connected" briefly, then "cannot join network" with no explanation. <b>The controller knows exactly what is wrong and the user is told nothing</b> — which is why this log line is worth memorising.</div>

<p class="lab-step"><span class="n">5</span>Measure what TKIP costs</p>

Enable TKIP alongside AES on the WLAN. Run `iperf3` from a modern client before and after.

<div class="lab-watch"><b>Things to notice</b>
Throughput <b>collapses</b> — 802.11n and later will not use TKIP, so the whole WLAN falls back to 802.11g rates for everyone. Your modern client did not change, and it is now a fraction as fast.
<br><br><b>One legacy device kept for compatibility can cost the entire SSID its speed</b>, silently. The right answer is a separate SSID for legacy kit, or replacing it.</div>

<p class="lab-step"><span class="n">6</span>Turn on PMF and WPA3</p>

Set `security pmf required`, then switch the WLAN to WPA3-SAE if your controller and clients support it.

<div class="lab-watch"><b>Things to notice</b>
With PMF required, a deauthentication frame from anything other than the real AP is <b>ignored</b> — the attack used to force a handshake capture stops working.
<br><br>With SAE, capture the join again: <b>there is no 4-way handshake to attack in the same way</b>. The exchange looks different and carries no offline verifier. Note also which of your clients refuse to connect — <b>that compatibility list is the real constraint on deploying WPA3</b>, not the configuration.</div>

<div class="lab-earned"><b>What you earned</b>
You have derived a PMK, a PTK and a MIC by hand and matched a real captured frame, so you know precisely what is and is not transmitted. You have measured your own offline guessing rate, which turns passphrase length from advice into arithmetic. You can recognise both reasons an SSID fails to broadcast, including the one where the controller reports UP. You know <code>reason 15</code> means the passphrase and nothing else. And you have watched one TKIP client cost an entire WLAN its throughput.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Is the passphrase transmitted during the 4-way handshake?</p>
<label class="qz-opt"><input type="radio" name="hq1"><span>No — both sides derive the same PTK independently and prove it with a MIC</span><em class="qz-fb qz-good">Correct. Nothing secret crosses the air; the MIC is the proof both sides reached the same answer.</em></label>
<label class="qz-opt"><input type="radio" name="hq1"><span>Yes, encrypted with the PMK</span><em class="qz-fb qz-bad">It is never sent in any form.</em></label>
<label class="qz-opt"><input type="radio" name="hq1"><span>Only its hash is sent</span><em class="qz-fb qz-bad">The MIC signs the frame; it is not a hash of the passphrase.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>If the passphrase is never sent, why is WPA2-PSK vulnerable to offline attack?</p>
<label class="qz-opt"><input type="radio" name="hq2"><span>The nonces, MACs and MIC are all captured — enough to test guesses offline at speed</span><em class="qz-fb qz-good">Correct. The handshake hands an attacker a verifier, so only passphrase length defends you.</em></label>
<label class="qz-opt"><input type="radio" name="hq2"><span>CCMP is broken</span><em class="qz-fb qz-bad">CCMP is sound. The weakness is the derivation being testable offline.</em></label>
<label class="qz-opt"><input type="radio" name="hq2"><span>The PMK is sent in M1</span><em class="qz-fb qz-bad">M1 carries only the ANonce.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What does WPA3-SAE change?</p>
<label class="qz-opt"><input type="radio" name="hq3"><span>Guesses can only be tested by interacting with the AP, and it adds forward secrecy</span><em class="qz-fb qz-good">Correct — the attack becomes online and rate-limited, and past captures stay private even if the passphrase leaks later.</em></label>
<label class="qz-opt"><input type="radio" name="hq3"><span>It removes the need for a passphrase</span><em class="qz-fb qz-bad">That is OWE, for open networks.</em></label>
<label class="qz-opt"><input type="radio" name="hq3"><span>It encrypts the passphrase before sending it</span><em class="qz-fb qz-bad">It is still never sent.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A new SSID is configured but does not broadcast, and <code>show wlan summary</code> shows it UP. What is wrong?</p>
<label class="qz-opt"><input type="radio" name="hq4"><span>The policy tag binding the WLAN to a policy profile was never applied to the APs</span><em class="qz-fb qz-good">Correct — the controller looks entirely healthy, which is what makes this one slow to find.</em></label>
<label class="qz-opt"><input type="radio" name="hq4"><span>The WLAN is shut down</span><em class="qz-fb qz-bad">Then it would show DOWN.</em></label>
<label class="qz-opt"><input type="radio" name="hq4"><span>The passphrase is too short</span><em class="qz-fb qz-bad">That would be rejected at configuration time.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does enabling TKIP alongside AES hurt performance?</p>
<label class="qz-opt"><input type="radio" name="hq5"><span>802.11n and later refuse to use TKIP, so the WLAN falls back to 802.11g rates for everyone</span><em class="qz-fb qz-good">Correct — one legacy device can cost the whole SSID its speed, with nothing reporting why.</em></label>
<label class="qz-opt"><input type="radio" name="hq5"><span>TKIP encryption is computationally slower</span><em class="qz-fb qz-bad">True but nowhere near enough to explain the drop.</em></label>
<label class="qz-opt"><input type="radio" name="hq5"><span>It doubles the number of beacons</span><em class="qz-fb qz-bad">Beacon count is unrelated to cipher choice.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>What does PMF protect against?</p>
<label class="qz-opt"><input type="radio" name="hq6"><span>Forged management frames — it stops deauthentication attacks</span><em class="qz-fb qz-good">Correct, and WPA3 makes it mandatory, which is one of its biggest practical wins.</em></label>
<label class="qz-opt"><input type="radio" name="hq6"><span>Offline passphrase guessing</span><em class="qz-fb qz-bad">That is SAE's job — though PMF does make capturing a handshake harder.</em></label>
<label class="qz-opt"><input type="radio" name="hq6"><span>Rogue access points</span><em class="qz-fb qz-bad">That needs rogue detection and containment.</em></label>
</div>

---

## References

- **IEEE 802.11i** — the RSN amendment that defines the 4-way handshake and CCMP.
- **RFC 2898** — PBKDF2, which produces the PMK.
- Wi-Fi Alliance — [WPA3 Specification](https://www.wi-fi.org/discover-wi-fi/security)
- Vanhoef & Piessens — *Key Reinstallation Attacks* (KRACK), CCS 2017.
- Cisco — [Catalyst 9800 WLAN Security Configuration](https://www.cisco.com/c/en/us/support/wireless/catalyst-9800-series-wireless-controllers/products-installation-and-configuration-guides-list.html)

---

*Related: [Wireless principles, RF and AP modes](/blog/wireless-principles-rf-channels-and-ap-modes) · [EAP-TLS frame by frame](/blog/eap-tls-explained-frame-by-frame) · [AAA: RADIUS and TACACS+](/blog/aaa-radius-tacacs-explained).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
