Window tapers the edges of a wavetable frame towards zero, preventing clicks and pops when the waveform loops or undergoes aggressive warping.

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

**Size** sets the width of the taper at the start and at the end of the frame, each as a percentage of the frame (0.0% to 50.0%). At 50% the two tapers meet in the middle and the whole frame is shaped. At 0% the frame passes through unchanged.

**Type** picks the window function used for the fade:

| Type     | Effect                                             |
| -------- | -------------------------------------------------- |
| Hann     | smooth, standard cosine-based fade                 |
| Hamming  | similar to Hann, but it only fades down to 0.08 instead of 0, so the edges do not reach complete silence |
| Blackman | steeper taper with suppressed side lobes           |
| BH       | Blackman-Harris, even higher side lobe suppression |
| Bartlett | linear triangular taper                            |
| Welch    | parabolic taper shape                              |
| Sine     | quarter-sine curve fade                            |

## How it works

With <md-latex>L</md-latex> as the length of one taper in samples (<md-latex>L = \text{Size}/100 \cdot 2048</md-latex>), the first <md-latex>L</md-latex> samples are multiplied by a fade-in <md-latex>w(x)</md-latex> with <md-latex>x = i / L</md-latex> running from 0 to 1. The last <md-latex>L</md-latex> samples get the same curve mirrored as a fade-out, and everything in between is left alone. The curves are:

| Type     | <md-latex>w(x)</md-latex>                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Hann     | <md-latex>\tfrac{1}{2}\left(1 - \cos(\pi x)\right)</md-latex>                                                   |
| Hamming  | <md-latex>0.54 - 0.46 \cos(\pi x)</md-latex>                                                                     |
| Blackman | <md-latex>0.42 - 0.5 \cos(\pi x) + 0.08 \cos(2\pi x)</md-latex>                                                  |
| BH       | <md-latex>0.35875 - 0.48829 \cos(\pi x) + 0.14128 \cos(2\pi x) - 0.01168 \cos(3\pi x)</md-latex>                |
| Bartlett | <md-latex>x</md-latex>                                                                                           |
| Welch    | <md-latex>1 - (1 - x)^2</md-latex>                                                                               |
| Sine     | <md-latex>\sin\left(\tfrac{\pi}{2} x\right)</md-latex>                                                           |

## Tutorial: smoothing frame edges

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Window** node and an **Output** node.
2. Connect Basic shapes to Window, and Window to the Output node.
3. Turn up the **Size** parameter to taper the edges of the waveform down to silence at the boundaries, ensuring a clean loop.

## Good to know

- Windowing is essential when preparing frames for wavetable synths to avoid abrupt amplitude jumps between the start and end of a cycle.

## The code

<md-lookup src="../graph/node/window.rs" />
