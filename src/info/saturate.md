Saturation distorts and warms up an audio signal by driving its amplitude and clipping or warping the waveform. It adds harmonic richness and bite to your sounds.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
["Saturation", { Shape: "Soft clip", In: 12.0, Out: 0.0, Mix: 100.0 }],
]'
/>

## At a glance

<md-params />

## Parameters

**Shape** picks the type of distortion curve:

| Shape     | Effect                                                                                  |
| --------- | --------------------------------------------------------------------------------------- |
| Soft clip | smooth, warm saturation using hyperbolic tangent                                        |
| Hard clip | aggressive clipping that cuts off peaks sharply                                         |
| Lin warp  | triangle wavefolder, the wave folds back like a bouncing ball when it passes full scale |
| Sin warp  | smooth sine wavefolder, the wave curves and folds back when it passes full scale        |

**In** boosts the input signal level before clipping (from -40 dB to +60 dB), driving the distortion harder.

**Out** controls the output level compensation (from -40 dB to +10 dB). It is applied after the distortion curve, so you can use it to bring a hard-driven signal back down.

**Mix** blends between the original dry signal and the distorted wet signal (0% to 100%).

<md-tip>
  Pushing the **In** gain up while using Soft clip is a great way to add
  analog-style warmth and harmonics to clean waveforms like Sines.
</md-tip>

## How it works

Every sample is multiplied by the **In** gain, sent through the curve of the chosen **Shape**, and then multiplied by the **Out** gain. With <md-latex>g_{in} = 10^{\text{In}/20}</md-latex>, <md-latex>g_{out} = 10^{\text{Out}/20}</md-latex> and <md-latex>u = g_{in} \cdot x</md-latex>:

| Shape     | Curve <md-latex>f(u)</md-latex>                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Soft clip | <md-latex>\tanh(u)</md-latex>                                                                                                     |
| Hard clip | <md-latex>\min(\max(u, -1), 1)</md-latex>                                                                                         |
| Lin warp  | a triangle wave with period 4 that follows <md-latex>u</md-latex> between -1 and 1 and bounces back at <md-latex>\pm 1</md-latex> |
| Sin warp  | <md-latex>\sin\left(\frac{\pi}{2} u\right)</md-latex>                                                                             |

The result is blended with the dry signal as <md-latex>\text{out} = x + \text{mix} \cdot (g_{out} \cdot f(u) - x)</md-latex>.

## Tutorial: adding grit to a clean wave

1. Drop a **Basic shapes** node set to Sine, then add a **Saturation** node and an **Output** node.
2. Connect Basic shapes to Saturation, and Saturation to the Output node.
3. Turn up the **In** gain knob to drive the sine wave into the distortion circuit.
4. Experiment with the **Shape** parameter to switch between smooth soft clipping and aggressive wavefolding.

## Good to know

- Even with **In** at 0 dB, Sin warp already bends the wave slightly (a full-scale peak stays at 1, but everything below it is reshaped), while Hard clip and Lin warp do nothing until the signal passes full scale.
- Saturation works on a sample-by-sample basis in the time domain, introducing upper harmonics that brighten and thicken the sound.

## The code

<md-lookup src="../graph/node/saturation.rs" />
