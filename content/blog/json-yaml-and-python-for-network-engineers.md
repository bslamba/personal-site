---
title: "JSON, YAML and Enough Python to Read the Script Somebody Handed You"
excerpt: "You do not need to become a developer. You need to look at a blob of JSON and say what type each value is, spot the trailing comma that broke the playbook, and read a twenty-line script well enough to know what it will do to your routers before you run it."
date: "2026-09-20"
tags: ["JSON", "YAML", "Python", "Automation", "Data formats", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 6.7 *Recognize components of JSON-encoded data*. ENCOR 350-401 — 6.2 *Construct valid JSON-encoded files*, 6.1 *Interpret basic Python components and scripts*.

## Cheat sheet

| JSON | Looks like | Notes |
|---|---|---|
| **Object** | `{ "key": value }` | Unordered. Keys **must** be double-quoted strings |
| **Array** | `[ 1, 2, 3 ]` | Ordered. Mixed types allowed |
| **String** | `"up"` | **Double quotes only.** Never single |
| **Number** | `1500`, `-3.5` | No quotes, no leading `+`, no hex |
| **Boolean** | `true` / `false` | **Lowercase.** Not `True`, not `"true"` |
| **Null** | `null` | Lowercase. Not `None`, not `nil` |

**The four things that invalidate JSON**, in the order you will hit them: a **trailing comma** after the last element · **single quotes** instead of double · **unquoted keys** · **comments**. JSON has no comments. None. Not `//`, not `#`.

| Python | Means |
|---|---|
| `dict` | Same shape as a JSON object — `{"a": 1}` |
| `list` | Same shape as a JSON array — `[1, 2]` |
| `json.loads(s)` | **s**tring → Python object |
| `json.dumps(o)` | Python object → **s**tring |
| `requests.get(url)` | Returns a response; `.json()` parses the body |
| `for x in y:` | Indentation defines the block. **Four spaces** |

---

## Reading a JSON blob correctly

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 275" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A JSON object containing a string a number a boolean null and a nested array of objects">
  <style>.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .key{fill:#2f5fd0}.sv1 .str{fill:#0f6b47}.sv1 .num{fill:#B80027}.sv1 .lit{fill:#8a5a00}
  </style>
  <text class="m" x="20" y="34">{</text>
  <text class="m" x="40" y="54"><tspan class="key">"hostname"</tspan>: <tspan class="str">"R1"</tspan>,</text>
  <text class="s" x="330" y="54">string — double quotes</text>
  <text class="m" x="40" y="74"><tspan class="key">"mtu"</tspan>: <tspan class="num">1500</tspan>,</text>
  <text class="s" x="330" y="74">number — no quotes</text>
  <text class="m" x="40" y="94"><tspan class="key">"enabled"</tspan>: <tspan class="lit">true</tspan>,</text>
  <text class="s" x="330" y="94">boolean — lowercase, unquoted</text>
  <text class="m" x="40" y="114"><tspan class="key">"description"</tspan>: <tspan class="lit">null</tspan>,</text>
  <text class="s" x="330" y="114">null — not "null", not None</text>
  <text class="m" x="40" y="134"><tspan class="key">"neighbours"</tspan>: [</text>
  <text class="s" x="330" y="134">array of objects</text>
  <text class="m" x="60" y="154">{ <tspan class="key">"id"</tspan>: <tspan class="str">"10.0.0.2"</tspan>, <tspan class="key">"state"</tspan>: <tspan class="str">"FULL"</tspan> },</text>
  <text class="m" x="60" y="174">{ <tspan class="key">"id"</tspan>: <tspan class="str">"10.0.0.3"</tspan>, <tspan class="key">"state"</tspan>: <tspan class="str">"2WAY"</tspan> }</text>
  <text class="s" x="330" y="174">no comma after the last one</text>
  <text class="m" x="40" y="194">]</text>
  <text class="m" x="20" y="214">}</text>
  <rect x="14" y="228" width="612" height="40" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="248" fill="#2f5fd0">Read it as: what type is each value, and how deep is it?</text>
  <text class="s" x="26" y="264">Exam questions almost always ask exactly that — the type of a value, or the path to reach one.</text>
</svg>
<figcaption><b>Figure 1.</b> Six value types and two containers. That is the entire format.</figcaption>
</figure>

<div class="why">
<b>The path to a value is the question that gets asked</b>
Given the object above, <code>neighbours</code> is an <b>array</b>, <code>neighbours[0]</code> is an <b>object</b>, and <code>neighbours[0]["state"]</code> is the <b>string</b> <code>"FULL"</code>.
<br><br>Read it outside in: braces mean look up by name, brackets mean index by position. Once you can say the path out loud you can write it in Python, in <code>jq</code>, or in an Ansible template without thinking about it.
</div>

---

## Four ways to break it

<div class="walk">
<div class="walk-head">Invalid JSON, and what the parser says <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="jsw" id="js1" checked><label for="js1"><span class="step-n">1</span>Trailing comma</label>
  <input type="radio" name="jsw" id="js2"><label for="js2"><span class="step-n">2</span>Single quotes</label>
  <input type="radio" name="jsw" id="js3"><label for="js3"><span class="step-n">3</span>Python-isms</label>
  <input type="radio" name="jsw" id="js4"><label for="js4"><span class="step-n">4</span>YAML instead</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A comma after the last element makes the document invalid">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .bad{fill:rgba(211,0,45,.10);stroke:#D3002D}.sv2 .ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}</style>
  <rect class="bad" x="14" y="26" width="298" height="76"/>
  <text class="m" x="26" y="48">{ "a": 1,</text>
  <text class="m" x="26" y="68">  "b": 2<tspan fill="#D3002D" font-weight="700">,</tspan></text>
  <text class="m" x="26" y="88">}</text>
  <rect class="ok" x="326" y="26" width="300" height="76"/>
  <text class="m" x="338" y="48">{ "a": 1,</text>
  <text class="m" x="338" y="68">  "b": 2</text>
  <text class="m" x="338" y="88">}</text>
  <text class="k" x="14" y="128" fill="#B80027">Expecting property name enclosed in double quotes: line 3 column 1</text>
  <text class="s" x="14" y="152">The error points at the closing brace, not at the comma. Look at the line BEFORE the one named.</text>
  <text class="s" x="14" y="168">Most languages tolerate a trailing comma. JSON does not, and this is the commonest mistake by far.</text>
</svg>
<p class="walk-say"><span class="walk-title">The comma that is not allowed</span>
Python, JavaScript and most config formats let you leave a comma after the last element. <b>JSON forbids it</b>, and the parser reports the position of the next token — the closing brace — so the error message points one line past the actual mistake.
<br><br>It shows up constantly when someone edits a generated file by hand and deletes the last entry without removing the preceding comma. <b>When a JSON error names a line, look at the line above it.</b></p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="JSON strings and keys require double quotes single quotes are invalid">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .bad{fill:rgba(211,0,45,.10);stroke:#D3002D}.sv3 .ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}</style>
  <rect class="bad" x="14" y="26" width="298" height="76"/>
  <text class="m" x="26" y="50">{ <tspan fill="#D3002D" font-weight="700">'name'</tspan>: <tspan fill="#D3002D" font-weight="700">'R1'</tspan> }</text>
  <text class="m" x="26" y="74">{ <tspan fill="#D3002D" font-weight="700">name</tspan>: "R1" }</text>
  <text class="s" x="26" y="94">single quotes · unquoted key</text>
  <rect class="ok" x="326" y="26" width="300" height="76"/>
  <text class="m" x="338" y="50">{ "name": "R1" }</text>
  <text class="s" x="338" y="94">the only valid form</text>
  <text class="k" x="14" y="128">Keys are always double-quoted strings. Always. Even numeric-looking ones.</text>
  <text class="s" x="14" y="152">This is why <tspan font-family="ui-monospace,Menlo,monospace">print(my_dict)</tspan> in Python does not produce valid JSON — it uses single quotes.</text>
  <text class="s" x="14" y="168">Use <tspan font-family="ui-monospace,Menlo,monospace">json.dumps()</tspan> when you need output another tool will parse.</text>
</svg>
<p class="walk-say"><span class="walk-title">Double quotes, on both sides</span>
JSON has exactly one string delimiter. Keys must be quoted strings even when they look like identifiers or numbers.
<br><br>The practical trap is Python's <code>print()</code> on a dictionary: the output <i>looks</i> like JSON and uses single quotes, so pasting it anywhere that parses JSON fails. <b><code>json.dumps()</code> is the difference between something that looks right and something that parses.</b></p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Python literals True False and None are not valid JSON which uses lowercase true false and null">
  <style>.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;fill:#17171A}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="20" y="24">PYTHON</text>
  <text class="hdr" x="230" y="24">JSON</text>
  <text class="hdr" x="430" y="24">AND NOT</text>
  <line x1="14" y1="32" x2="626" y2="32" stroke="#D9D9DE"/>
  <text class="m" x="20" y="54">True</text><text class="m" x="230" y="54" fill="#0f6b47">true</text><text class="m" x="430" y="54" fill="#B80027">"true"</text>
  <text class="m" x="20" y="76">False</text><text class="m" x="230" y="76" fill="#0f6b47">false</text><text class="m" x="430" y="76" fill="#B80027">"False"</text>
  <text class="m" x="20" y="98">None</text><text class="m" x="230" y="98" fill="#0f6b47">null</text><text class="m" x="430" y="98" fill="#B80027">"null"  nil</text>
  <text class="m" x="20" y="120">dict</text><text class="m" x="230" y="120" fill="#0f6b47">object { }</text>
  <text class="m" x="20" y="142">list</text><text class="m" x="230" y="142" fill="#0f6b47">array [ ]</text>
  <text class="k" x="14" y="176"><tspan fill="#B80027">"true"</tspan> is a string. <tspan fill="#0f6b47">true</tspan> is a boolean. A comparison against the wrong one silently fails.</text>
</svg>
<p class="walk-say"><span class="walk-title">Case matters, and so do the quotes</span>
JSON's literals are lowercase and unquoted. Python's are capitalised, and <code>null</code> is <code>None</code>.
<br><br>The quiet version of this bug: <code>"enabled": "false"</code> is a <b>non-empty string</b>, and in most languages a non-empty string is truthy. So a check for "is this disabled" passes when it should fail, nothing errors, and the automation does the opposite of what you meant. <b>Type errors in JSON do not crash — they just give the wrong answer.</b></p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same data expressed in YAML using indentation instead of braces">
  <style>.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">SAME DATA, YAML</text>
  <rect class="f" x="14" y="30" width="300" height="106"/>
  <text class="m" x="26" y="50">hostname: R1</text>
  <text class="m" x="26" y="68">mtu: 1500</text>
  <text class="m" x="26" y="86">enabled: true</text>
  <text class="m" x="26" y="104">neighbours:</text>
  <text class="m" x="26" y="122">  - id: 10.0.0.2</text>
  <text class="s" x="330" y="52">no braces, no quotes needed</text>
  <text class="s" x="330" y="72">indentation is the structure</text>
  <text class="s" x="330" y="92"><tspan font-family="ui-monospace,Menlo,monospace">-</tspan> starts a list item</text>
  <text class="s" x="330" y="112">and it does have comments</text>
  <text class="k" x="14" y="162" fill="#B80027">Tabs are illegal in YAML. Spaces only — and an editor that inserts tabs will ruin your day.</text>
  <text class="s" x="14" y="186">YAML is a superset of JSON, so any valid JSON is also valid YAML. The reverse is not true.</text>
</svg>
<p class="walk-say"><span class="walk-title">YAML — what Ansible actually eats</span>
Same data model, friendlier to write: indentation instead of braces, <code>-</code> for list items, and <b>comments with <code>#</code></b>, which JSON lacks entirely.
<br><br>Two things bite. <b>Tabs are forbidden</b> — YAML requires spaces, and a tab produces an error that does not mention tabs. And YAML is aggressive about types: unquoted <code>yes</code>, <code>no</code>, <code>on</code>, <code>off</code> become booleans, and a version number like <code>17.9</code> becomes a float that loses a trailing zero. <b>Quote anything you want kept as a string.</b></p>
</div>
</div>
</div>

---

## A script you can read

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>inventory.py — twenty lines, and nothing it does is mysterious</div>
<pre><span class="o">#!/usr/bin/env python3</span>
<span class="y">import</span> json
<span class="y">import</span> requests
requests.packages.urllib3.disable_warnings()

DEVICES = [<span class="g">"10.0.0.1"</span>, <span class="g">"10.0.0.2"</span>, <span class="g">"10.0.0.3"</span>]
URL = <span class="g">"https://{}/restconf/data/Cisco-IOS-XE-native:native/hostname"</span>
HEADERS = {<span class="g">"Accept"</span>: <span class="g">"application/yang-data+json"</span>}

results = []

<span class="y">for</span> ip <span class="y">in</span> DEVICES:
    <span class="y">try</span>:
        r = requests.get(URL.format(ip), headers=HEADERS,
                         auth=(<span class="g">"apiuser"</span>, <span class="g">"PASSWORD"</span>),
                         verify=<span class="r">False</span>, timeout=5)
        <span class="y">if</span> r.status_code == 200:
            name = r.json()[<span class="g">"Cisco-IOS-XE-native:hostname"</span>]
            results.append({<span class="g">"ip"</span>: ip, <span class="g">"hostname"</span>: name, <span class="g">"ok"</span>: <span class="r">True</span>})
        <span class="y">else</span>:
            results.append({<span class="g">"ip"</span>: ip, <span class="g">"error"</span>: r.status_code, <span class="g">"ok"</span>: <span class="r">False</span>})
    <span class="y">except</span> requests.exceptions.RequestException <span class="y">as</span> e:
        results.append({<span class="g">"ip"</span>: ip, <span class="g">"error"</span>: str(e), <span class="g">"ok"</span>: <span class="r">False</span>})

print(json.dumps(results, indent=2))<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Read it top to bottom and say what it does:</b> for each of three addresses, send an HTTPS GET, and if the status is 200 pull one value out of the JSON body; otherwise record why not. Print the lot as JSON. <b>It only reads</b> — there is no POST, PUT or PATCH anywhere, so the worst it can do is fail.</p>

<div class="cmd">
<div class="cmd-line"><span class="t">for</span> <span class="opt">ip</span> <span class="t">in</span> <span class="opt">DEVICES</span>:
    <span class="opt">...</span>
<span class="t">r.status_code</span> == <span class="opt">200</span>
<span class="t">r.json()</span>[<span class="opt">"Cisco-IOS-XE-native:hostname"</span>]
<span class="t">verify</span>=<span class="opt">False</span>
<span class="t">timeout</span>=<span class="opt">5</span>
<span class="t">json.dumps</span>(<span class="opt">results, indent=2</span>)</div>
<dl class="cmd-parts">
<div><dt>for ip in DEVICES:</dt><dd>Iterate over a list. <b>The colon opens a block and the indentation defines it</b> — Python has no braces, so an inconsistent indent is a syntax error rather than a style opinion.</dd></div>
<div class="is-key"><dt>r.status_code == 200</dt><dd><b>Check the code, not whether a body parsed.</b> A successful write returns 204 with no body, so code written around "did I get JSON back" reports successes as failures.</dd></div>
<div><dt>r.json()[...]</dt><dd><code>.json()</code> parses the body into a Python dict. Then it is ordinary dictionary lookup — the key is namespaced because the YANG model says so.</dd></div>
<div class="is-key"><dt>verify=False</dt><dd><b>Disables certificate verification</b>, the Python equivalent of <code>curl -k</code>. Acceptable in a lab with self-signed certificates. In production it means you cannot tell the device from anything that answers on that address — fix the certificate instead of keeping this line.</dd></div>
<div class="is-key"><dt>timeout=5</dt><dd><b>Without it, requests waits indefinitely.</b> One unreachable device and your script across 400 routers hangs for ever with no output. This single argument is the difference between a tool and a hazard.</dd></div>
<div><dt>json.dumps(…, indent=2)</dt><dd>Produces <i>valid</i> JSON — double quotes, <code>true</code>/<code>false</code>/<code>null</code> — that another tool can consume. <code>print(results)</code> would emit Python's repr with single quotes, which looks the same and does not parse.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
The first automation that pays for itself is <b>read-only and boring</b>: collect the software version, uptime and interface descriptions from every device into one JSON file, once a night. It answers audit questions in seconds and it physically cannot break anything.
<br><br>The second is a <b>diff</b> — run the same collection twice and compare. "What changed between Friday and Monday" is a question the CLI answers badly and a JSON diff answers instantly.
<br><br>Write anything only after both of those are running. Every automation disaster starts with a write loop that was tested on one device.
</div>

---

## What goes wrong

**`Expecting property name…` on the closing brace.** Trailing comma on the line above.

**`Expecting value: line 1 column 1`.** The body was not JSON at all — usually an HTML error page, or a 204 with no body.

**Comparison against `"false"` never matches.** It is a string. `"false"` is truthy.

**YAML fails with an unhelpful error.** A tab. Or `17.9` parsed as a float, or `no` parsed as a boolean.

**Output looks like JSON but nothing will parse it.** `print()` of a dict. Use `json.dumps()`.

**Script hangs for ever.** No `timeout=`.

**`KeyError`.** The key is namespaced — `Cisco-IOS-XE-native:hostname`, not `hostname`.

---

<div class="lab">
<div class="lab-head">Lab — break JSON on purpose, then build something useful</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Produce each of the four classic JSON errors and learn to recognise its message. Convert between JSON and YAML and watch YAML's type coercion mangle a version number. Then write a read-only inventory script, run it against a device that is switched off, and fix the two things that go wrong.</div>

**Setup.** Python 3 with `requests` and `pyyaml`, plus `jq` if you have it. One IOS-XE device or a [DevNet sandbox](https://developer.cisco.com/site/sandbox/).

<p class="lab-step"><span class="n">1</span>Break it four ways</p>

Write a small valid JSON file, then make four broken copies: trailing comma, single quotes, unquoted key, and one with a `// comment`.

```bash
python3 -c "import json,sys; json.load(open(sys.argv[1]))" broken1.json
```

<div class="lab-watch"><b>Things to notice</b>
Read each error carefully. The trailing comma reports the <b>line after</b> the mistake. The comment reports <code>Expecting value</code> at the comment's position.
<br><br>These four messages cover most JSON failures you will ever see. <b>Ten minutes here saves an hour later</b>, because the messages are unhelpful only until you have seen them once.</div>

<p class="lab-step"><span class="n">2</span>Watch YAML change your data</p>

```bash
python3 -c "import yaml,json; print(json.dumps(yaml.safe_load(open('t.yaml')),indent=2))"
```

Put this in `t.yaml`:

```yaml
version: 17.9
enabled: no
vlan: 0100
name: R1
```

<div class="lab-watch"><b>Things to notice</b>
<code>17.9</code> became a <b>float</b>, <code>no</code> became <b>false</b>, and <code>0100</code> may lose its leading zero. None of that was asked for.
<br><br>Quote them — <code>version: "17.9"</code> — and they stay strings. <b>This is why Ansible inventories quote version numbers and VLAN IDs</b>, and why a playbook can behave differently after someone "tidied up" the quotes.</div>

<p class="lab-step"><span class="n">3</span>Read one value out of a real device</p>

Enable RESTCONF (see [the RESTCONF article](/blog/netconf-restconf-yang-and-rest-apis)) and fetch the hostname with curl, then with Python.

<div class="lab-watch"><b>Things to notice</b>
The key is <b><code>Cisco-IOS-XE-native:hostname</code></b>, not <code>hostname</code>. Try the short version and get a <code>KeyError</code> — namespacing is not decoration.
<br><br>Pipe the curl output through <code>jq .</code> to see it formatted, then <code>jq -r '.["Cisco-IOS-XE-native:hostname"]'</code> to extract just the value.</div>

<p class="lab-step"><span class="n">4</span>Run it against a dead device</p>

Point the script at an address that does not answer — **without** `timeout=` and **without** the `try`/`except`.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It hangs</b> — correct. That is the exercise. Ctrl-C.</li>
<li><b>It crashes on the first failure</b> — also correct, and the remaining devices are never polled.</li>
<li><b>It works</b> — your address is being actively refused rather than dropped. Use an address in a black-holed subnet.</li>
</ul>
Add <code>timeout=5</code> and the try/except, and re-run. <b>Now one dead device costs five seconds and a recorded error</b> instead of the whole run. This is the difference between a script and a tool.</div>

<p class="lab-step"><span class="n">5</span>Make it a diff</p>

Run the inventory twice, saving to `before.json` and `after.json`, with a configuration change in between.

<div class="lab-watch"><b>Things to notice</b>
<code>diff <(jq -S . before.json) <(jq -S . after.json)</code> — <code>-S</code> sorts keys so the diff shows real changes rather than reordering.
<br><br>You now have an answer to "what changed", derived from the devices rather than from anybody's memory. <b>That is a genuinely useful tool and it is about twenty-five lines of read-only code.</b></div>

<div class="lab-earned"><b>What you earned</b>
You can name the type of any value in a JSON document and write the path to reach it. You recognise all four common syntax errors from their messages, including the one that points at the wrong line. You have watched YAML silently retype a version number and know to quote it. You can read a short script and say what it will do before running it — and you have fixed the two omissions, a missing timeout and no error handling, that turn a read-only script into something that hangs across your whole estate.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>In <code>{"mtu": 1500, "up": true, "desc": null}</code>, what type is each value?</p>
<label class="qz-opt"><input type="radio" name="jq1"><span>number, boolean, null</span><em class="qz-fb qz-good">Correct — unquoted and lowercase. Quoting any of them would make it a string.</em></label>
<label class="qz-opt"><input type="radio" name="jq1"><span>All strings</span><em class="qz-fb qz-bad">Only double-quoted values are strings.</em></label>
<label class="qz-opt"><input type="radio" name="jq1"><span>number, string, string</span><em class="qz-fb qz-bad"><code>true</code> and <code>null</code> are unquoted literals, not strings.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Which makes a JSON document invalid?</p>
<label class="qz-opt"><input type="radio" name="jq2"><span>A comma after the last element of an object</span><em class="qz-fb qz-good">Correct, and the error names the following line — look at the one above it.</em></label>
<label class="qz-opt"><input type="radio" name="jq2"><span>An array holding mixed types</span><em class="qz-fb qz-bad">Perfectly legal.</em></label>
<label class="qz-opt"><input type="radio" name="jq2"><span>Nesting objects inside arrays</span><em class="qz-fb qz-bad">Normal and extremely common.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Given <code>{"n":[{"id":"A"},{"id":"B"}]}</code>, how do you reach <code>"B"</code>?</p>
<label class="qz-opt"><input type="radio" name="jq3"><span><code>n[1]["id"]</code></span><em class="qz-fb qz-good">Correct — brackets index the array from zero, then the key looks up in the object.</em></label>
<label class="qz-opt"><input type="radio" name="jq3"><span><code>n["id"][1]</code></span><em class="qz-fb qz-bad">Wrong order — <code>n</code> is an array, so it must be indexed first.</em></label>
<label class="qz-opt"><input type="radio" name="jq3"><span><code>n[2].id</code></span><em class="qz-fb qz-bad">Off by one; arrays start at 0.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why does <code>print(my_dict)</code> in Python not produce valid JSON?</p>
<label class="qz-opt"><input type="radio" name="jq4"><span>It uses single quotes and Python literals like <code>True</code> and <code>None</code></span><em class="qz-fb qz-good">Correct. <code>json.dumps()</code> emits double quotes and <code>true</code>/<code>null</code>.</em></label>
<label class="qz-opt"><input type="radio" name="jq4"><span>Dictionaries cannot be represented in JSON</span><em class="qz-fb qz-bad">A dict maps directly onto a JSON object.</em></label>
<label class="qz-opt"><input type="radio" name="jq4"><span>It sorts the keys</span><em class="qz-fb qz-bad">Key order is not what makes it invalid.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Your script hangs for ever against one device. What is missing?</p>
<label class="qz-opt"><input type="radio" name="jq5"><span><code>timeout=</code> on the request</span><em class="qz-fb qz-good">Correct — without it, requests waits indefinitely and one silent device stalls the entire run.</em></label>
<label class="qz-opt"><input type="radio" name="jq5"><span><code>verify=False</code></span><em class="qz-fb qz-bad">That affects certificate checking, which fails fast rather than hanging.</em></label>
<label class="qz-opt"><input type="radio" name="jq5"><span>A bigger loop</span><em class="qz-fb qz-bad">The loop is not the problem — the blocking call is.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Which is true of YAML but not JSON?</p>
<label class="qz-opt"><input type="radio" name="jq6"><span>It supports comments, and uses indentation rather than braces</span><em class="qz-fb qz-good">Correct — and tabs are forbidden, spaces only.</em></label>
<label class="qz-opt"><input type="radio" name="jq6"><span>It cannot represent lists</span><em class="qz-fb qz-bad">It can — that is what <code>-</code> is for.</em></label>
<label class="qz-opt"><input type="radio" name="jq6"><span>JSON is not valid YAML</span><em class="qz-fb qz-bad">Backwards: YAML is a superset, so valid JSON is valid YAML.</em></label>
</div>

---

## References

- **RFC 8259** — *The JavaScript Object Notation (JSON) Data Interchange Format*. Short, and it is the whole specification.
- [json.org](https://www.json.org/) — the grammar as diagrams, on one page.
- [YAML 1.2 specification](https://yaml.org/spec/1.2.2/)
- [Python `json` module](https://docs.python.org/3/library/json.html) · [`requests` quickstart](https://requests.readthedocs.io/en/latest/user/quickstart/)
- [Cisco DevNet sandboxes](https://developer.cisco.com/site/sandbox/) — free IOS-XE devices to run any of this against.

---

*Related: [NETCONF, RESTCONF and YANG](/blog/netconf-restconf-yang-and-rest-apis) · [Linux commands for network engineers](/blog/linux-commands-for-network-and-security-engineers).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
