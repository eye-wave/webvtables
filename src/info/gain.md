Gain controls the amplitude and overall output level of an audio signal, acting as a volume control or amplifier stage.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Gain", { Volume: 5.0 }],
]'
/>

This is the real node, running. Connect an audio source to adjust its volume level in real time.

## At a glance

<md-params />

## Parameters

**Volume** sets the signal gain level in decibels (-30.0 dB to 30.0 dB).

<md-tip>
  Setting the **Volume** to 0.0 dB passes the audio signal through at unity gain
  without boosting or attenuating its amplitude.
</md-tip>

## How it works

The Gain node scales each sample in the input buffer by a linear multiplier derived from the decibel-based **Volume** parameter, increasing or decreasing the signal amplitude before routing it to the output:

<md-latex>\text{out} = \text{in} \cdot 10^{\text{dB}/20}</md-latex>

So +6 dB roughly doubles the amplitude (<md-latex>\times 2</md-latex>), -6 dB roughly halves it, and +/-30 dB corresponds to a factor of about <md-latex>31.6</md-latex> or <md-latex>0.0316</md-latex>.

<md-tip>
  You can click the clip button directly on the node interface for a hard
  clipper, which cuts any exceeding peaks. Notice how the red overflowing line
  turns green when 'clip' is on.
</md-tip>

## Tutorial: adjusting signal volume

1. Drop a **Basic shapes** node and a **Gain** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Gain node.
3. Route the output to the Output node and adjust the **Volume** parameter to hear the level change.

## Good to know

- Because volume adjustments operate linearly on every sample, boosting the gain excessively on hot signals can clip the output buffer and introduce digital distortion.

## The code

<md-lookup src="../graph/node/gain.rs" />
