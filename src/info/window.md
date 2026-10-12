Window tapers the edges of a wavetable frame to zero, preventing clicks and pops when the waveform loops or undergoes aggressive warping.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Window", { Size: 15.0, Type: "Hann" }],
]'
/>

This is the real node, running. Drag the knobs to change the window settings and watch the waveform edges fade. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Size** sets the width of the taper at the start and end of the frame (0.0% to 50.0%).

**Type** picks the window function used for the fade:

| Type     | Effect                                             |
| -------- | -------------------------------------------------- |
| Hann     | smooth, standard cosine-based fade                 |
| Hamming  | similar to Hann with a slightly different floor    |
| Blackman | steeper taper with suppressed side lobes           |
| BH       | Blackman-Harris, even higher side lobe suppression |
| Bartlett | linear triangular taper                            |
| Welch    | parabolic taper shape                              |
| Sine     | quarter-sine curve fade                            |

## Tutorial: smoothing frame edges

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Window** node and an **Output** node.
2. Connect Basic shapes to Window, and Window to the Output node.
3. Turn up the **Size** parameter to taper the edges of the waveform down to silence at the boundaries, ensuring a clean loop.

## Good to know

- Windowing is essential when preparing frames for wavetable synths to avoid abrupt amplitude jumps between the start and end of a cycle.
