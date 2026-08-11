---
title: "TCP Explained: The Handshake, the Header, TCP Options and Nagle's Algorithm"
excerpt: "What the Transmission Control Block actually holds, every field in the TCP header, the options that determine throughput, and why Nagle's algorithm makes RDP feel sluggish."
date: "2026-01-08"
tags: ["Networking", "TCP", "Fundamentals", "Performance", "Troubleshooting"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **TCB** | Transmission Control Block — a block of memory holding the state for a single TCP session |
| **TCB holds** | Socket information: source IP, source port, destination IP, destination port |
| **Active open** | Client requests service. Applications like FTP, email, HTTP. |
| **Passive open** | Server listens in advance. An **unspecified passive open** waits for any client — a *partial socket*. |
| **Handshake** | SYN → SYN-ACK → ACK |
| **Teardown** | FIN → ACK → FIN → ACK (four-way) |
| **Data offset** | Size of the TCP header |
| **Window size** | Data that can be sent without an ACK. **Default 4128 B, maximum 65,535 B** |
| **Checksum** | Result of a CRC check |
| **Urgent pointer** | Points to the bit where the urgent data ends |
| **MSS** | Maximum segment size. Default 536 B, maximum 1460 B |
| **Window Scale** | Option to increase the receive window beyond 65,535 |
| **SACK** | Selective Acknowledgement — ACK non-contiguous blocks |
| **NOP** | No Operation — used for padding options to a 4-byte boundary |
| **Nagle** | Combines small outgoing writes into one segment. Disable with **TCP_NODELAY** for RDP, Telnet, interactive traffic. |

---

TCP is the protocol most people say they understand and few can describe precisely. It's worth doing properly, because almost every "the network is slow" complaint is resolved somewhere in this article.

## The Transmission Control Block

Every TCP session has a **Transmission Control Block** — a block of memory the operating system allocates to maintain state for that one connection.

The TCB holds the **socket information**: source IP, source port, destination IP, destination port. That four-tuple is what uniquely identifies a connection, which is why two different browser tabs to the same server work fine — different source ports, different TCBs.

It also tracks sequence numbers, window sizes, retransmission timers and connection state. This is what "stateful" means in practice, and it's why a firewall tracking a million connections needs real memory.

## Active and passive opens

TCBs are created two ways, and the distinction matters when you're reading socket state.

**Active open (client).** The client requests a TCP service, and a TCB is created. This is what applications like FTP, email and HTTP do when they initiate a connection.

**Passive open (server).** The TCB is created *in advance*, before any client arrives — the server is listening. An **unspecified passive open** waits for a connection from any client, which is called a **partial socket**: the local side is fully specified, the remote side is not yet known.

That's precisely what a listening socket is. `netstat -an | grep LISTEN` shows you partial sockets waiting to be completed.

## The three-way handshake

```
Client                          Server
  |------------ SYN ------------->|
  |<--------- SYN-ACK ------------|
  |------------ ACK ------------->|
```

**SYN** — client proposes a connection with its initial sequence number.
**SYN-ACK** — server acknowledges and sends its own initial sequence number.
**ACK** — client acknowledges. The connection is established.

Both sides exchange TCP options during the handshake — MSS, window scale, SACK support. **Options are negotiated only here.** If window scaling isn't agreed in the handshake, it cannot be used later for that connection, which matters when a middlebox strips options.

**What the handshake tells you diagnostically:** if it completes, layer 3 and layer 4 are working and something is listening. If the connection then hangs, the problem is above — or it's an MTU black hole.

## Closing: the four-way teardown

```
  |------------ FIN ------------->|
  |<------------ ACK -------------|
  |<------------ FIN -------------|
  |------------ ACK ------------->|
```

Each direction closes independently, because TCP is full duplex. One side can finish sending while still receiving.

**TIME_WAIT** is where the closing side sits afterwards, for twice the maximum segment lifetime, ensuring delayed segments don't confuse a later connection using the same ports. A server with thousands of sockets in TIME_WAIT is usually normal, not broken — though it can exhaust ports on a very busy client.

## The header, field by field

| Field | Purpose |
|---|---|
| Source port | 16 bits |
| Destination port | 16 bits |
| Sequence number | 32 bits — position of this segment's data in the stream |
| Acknowledgement number | 32 bits — next byte expected |
| **Data offset** | Size of the TCP header, in 32-bit words |
| Reserved | Unused |
| Flags | URG, ACK, PSH, RST, SYN, FIN |
| **Window size** | Data that can be sent in advance without an ACK. **Default 4128 bytes, maximum 65,535 bytes** |
| **Checksum** | Result of a CRC check |
| **Urgent pointer** | Points to the bit where the urgent data ends |
| Options | Variable length, padded to a 32-bit boundary |

### Window size, and why it caps throughput

The window is how much data may be in flight unacknowledged. With a 16-bit field, the maximum is **65,535 bytes** — and that's the ceiling that makes the Window Scale option necessary.

On a high-latency link, a 64 KB window is a hard throughput limit regardless of available bandwidth. Bandwidth-delay product: 64 KB over a 100 ms round trip caps you at roughly 5 Mbit/s, no matter what the link can carry.

That's the classic "we have a 1 Gbit link to Singapore and file transfers run at 5 Mbit" problem. It's not the link; it's the window.

### The flags

**SYN, ACK, FIN** — connection lifecycle, as above.

**RST** — abrupt reset. Something refused or aborted the connection. A RST arriving immediately after SYN means nothing is listening on that port. A RST mid-conversation usually means a firewall or load balancer terminated it, and it's one of the more informative things you can see in a capture.

**PSH** — push this data to the application now rather than buffering.

**URG** with the urgent pointer — rarely used, and mostly of historical interest.

## TCP options that determine performance

Negotiated in the handshake only.

**MSS — Maximum Segment Size.** Default 536 bytes, maximum 1460 bytes. That 1460 is 1500 (Ethernet MTU) minus 20 bytes IP header minus 20 bytes TCP header. Each side advertises what it can receive.

**Window Scale.** Multiplies the window field by a negotiated power of two, allowing windows far beyond 65,535 bytes. **This is the fix for the high-latency throughput problem.** Both sides must support and negotiate it in the handshake; if a middlebox strips the option, you're back to 64 KB and wondering why.

**SACK — Selective Acknowledgement.** Without it, losing one segment means retransmitting everything after it. With SACK, the receiver acknowledges non-contiguous blocks it did receive, so only the genuinely missing segment is resent. On a lossy link the difference is dramatic.

**NOP — No Operation.** Padding, used to align options to a 4-byte boundary. Not interesting in itself, but it appears constantly in captures and confuses people reading them for the first time.

**Timestamps.** Better round-trip time measurement and protection against sequence number wraparound on fast links.

## Nagle's algorithm

This is the one that produces real, user-visible complaints.

**The problem it solves:** an application writing one byte at a time produces a 41-byte packet per byte of data. On a slow link, that's catastrophic overhead.

**What Nagle does:** combine small outgoing messages and send them all at once. It holds sending a new small segment until it receives an ACK for the previous one.

In pseudocode:

```
if there is new data to send
    if the window size >= MSS and available data is >= MSS
        send complete MSS segment now
    else
        if there is unconfirmed data still in the pipe
            enqueue data in the buffer until an acknowledge is received
        else
            send data immediately
        end if
    end if
end if
```

**Why that hurts interactive traffic:** every small write now waits a full round trip. For a bulk transfer that's irrelevant. For a remote desktop session or a terminal, it means each keystroke or screen update waits for an ACK, and the session feels laggy in a way that has nothing to do with bandwidth.

It gets worse when Nagle interacts with delayed ACK — the receiver holds its ACK for up to 200 ms hoping to combine it with data, while the sender holds its data waiting for that ACK. Both sides waiting on each other.

**The fix:** disable Nagle's algorithm for interactive applications using the **TCP_NODELAY** socket option. Applications like **RDP** and **Telnet** send TCP_NODELAY in their TCP options for exactly this reason.

If someone reports that RDP feels sluggish on a high-latency link while file copies run fine, this is where to look.

## Reading a capture

The things worth checking, in order:

**Does the handshake complete?** SYN, SYN-ACK, ACK. If not, nothing else matters.

**What MSS was negotiated?** A surprisingly low value points at a tunnel or a middlebox reducing it.

**Was window scaling agreed?** If not, and it's a long-distance link, you've found your throughput ceiling.

**Are there retransmissions?** Occasional is normal. Frequent means loss, and SACK blocks will show what's missing.

**Is the window shrinking towards zero?** Zero-window means the receiver's application isn't reading fast enough. That's an application or host resource problem, not a network one — a genuinely valuable distinction to be able to prove.

**Are there RSTs?** And which side sent them, and when.

---

Almost every performance complaint resolves to one of four things: a window too small for the latency, an MTU problem, packet loss without SACK, or Nagle interacting badly with an interactive application. A capture and this list answers it faster than any amount of speculation about bandwidth.
