Bit crusher degrades audio quality by reducing bit depth or sample rate, giving sounds a digital, retro edge.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sine" }],
[
"Bit crusher",
{ Type: "Downsample", Strength: 0.8, Shift: 0.0, Mix: 100.0 },
],
]'
/>

## At a glance

<md-params />

## Parameters

**Type** selects the mode of degradation:

| Type       | Effect                                                           |
| ---------- | ---------------------------------------------------------------- |
| Bit crush  | lowers the bit depth to add quantization noise and crunch        |
| Downsample | reduces the effective sample rate by holding values across steps |

**Strength** controls how intensely the signal is degraded (0.0 to 1.0). With <md-latex>s</md-latex> as the Strength value:

| Type       | What Strength does                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Bit crush  | sets the bit depth <md-latex>b = 16 - 20s</md-latex>, quantizing to steps of <md-latex>2^{-b}</md-latex> |
| Downsample | holds each value for <md-latex>2^{10s}</md-latex> samples (1 to 1024)                                    |

**Shift** offsets the sample-and-hold phase when using the Downsample mode (0.0 to 1.0).

**Mix** blends between the original dry signal and the processed wet signal (0% to 100%).

<md-tip>
  Past a Strength of about 0.85 the Bit crush mode quantizes everything to zero (the bit depth <md-latex>b</md-latex> drops below <md-latex>-1</md-latex>), so a full-scale signal goes silent. Keep Strength lower for audible crunch.
</md-tip>

<md-tip>
  Using Downsample on smooth waves like Sine introduces digital aliasing and
  ringing that mimics classic 8-bit video game hardware.
</md-tip>

## Tutorial: adding digital grit

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Bit crusher** node and an **Output** node.
2. Connect Basic shapes to Bit crusher, and Bit crusher to the Output node.
3. Switch **Type** to Bit crush and increase **Strength** to roughen up the clean waveform with digital distortion.

## Good to know

- The bit crush mode reduces resolution down into very low bit depths, which creates a harsh, buzzy character filled with high-frequency quantization noise. The quantizer is <md-latex>y = \frac{\operatorname{round}(x \cdot 2^{b})}{2^{b}}</md-latex>, and at <md-latex>s = 0.8</md-latex> (<md-latex>b = 0</md-latex>) a full-scale signal can only land on <md-latex>-1</md-latex>, <md-latex>0</md-latex> or <md-latex>1</md-latex>.
- The Mix is a linear blend: <md-latex>\text{out} = \text{dry} + (\text{wet} - \text{dry}) \cdot \text{mix}</md-latex>.

## The code

<md-lookup src="../graph/node/bit_crush.rs" />
