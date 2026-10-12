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

**Multiply** sets how many times the waveform repeats across the buffer (0.0 to 50.0x).

## Tutorial: hard-sync effects

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Sync warp** node and an **Output** node.
2. Connect Basic shapes to Sync warp, and Sync warp to the Output node.
3. Turn up the **Multiply** knob to pack multiple copies of the waveform into the single frame, creating classic aggressive sync sweeps.

## Good to know

- Because hard edges at the frame boundaries can click when repeating, you can use a **Window** node right after Sync warp to fade the edges smoothly for a cleaner pitch-shifting effect.
