Sync warp multiplies the frequency of the waveform by repeating cycles across the frame. It acts like a hard-sync or pitch-shifting effect for wavetables.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Sync warp", { Multiply: 4.0 }],
]'
/>

This is the real node, running. Drag the knob to change Multiply and watch the waveform repeat. Double-click the knob to reset it.

## At a glance

<md-params />

## Parameters

**Multiply** sets how many times the waveform repeats across the buffer (0.0 to 50.0x). Fractional values are allowed, but they leave a partial copy at the end of the frame, so the wave does not loop smoothly.

## How it works

Sync warp reads the input buffer faster than normal and wraps around when it reaches the end. For output sample <md-latex>i</md-latex> and a **Multiply** value of <md-latex>m</md-latex>, the read position is <md-latex>p = i \cdot m</md-latex>, and the output is a linear interpolation between the two samples around <md-latex>p</md-latex> (with the position wrapping at 2048):

<md-latex>y_i = (1 - t) \cdot x_{\lfloor p \rfloor \bmod 2048} + t \cdot x_{(\lfloor p \rfloor + 1) \bmod 2048}, \qquad t = p - \lfloor p \rfloor</md-latex>

A Multiply of 1 leaves the wave unchanged, and 0 repeats the first sample for the whole frame.

## Tutorial: hard-sync effects

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Sync warp** node and an **Output** node.
2. Connect Basic shapes to Sync warp, and Sync warp to the Output node.
3. Turn up the **Multiply** knob to pack multiple copies of the waveform into the single frame, creating classic aggressive sync sweeps.

## Good to know

- Because hard edges at the frame boundaries can click when repeating, you can use a **Window** node right after Sync warp to fade the edges smoothly for a cleaner pitch-shifting effect.

## The code

<md-lookup src="../graph/node/sync_warp.rs" />
