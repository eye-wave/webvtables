Waveshaper reshapes a waveform with a transfer curve that you draw yourself. Every sample is looked up on the curve, so the curve decides exactly how loud, soft or distorted each level of the input becomes. It is the free-form version of **Saturation**, which only offers four fixed curves.

## At a glance

<md-params />

## Parameters

**Polarity** picks how the curve is applied to the signal:

| Polarity | Effect                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Bipolar  | the curve is used as drawn, so positive and negative levels can be shaped differently                                                         |
| Unipolar | the curve is squeezed into 0 to +1 on both axes and used for the size of the signal. The negative half is a mirror image of the positive half |

**In** boosts the input signal level before it reaches the curve (from -40 dB to +60 dB), driving the signal further along the curve.

**Out** controls the output level (from -40 dB to +10 dB). It is applied after the curve, so you can use it to bring a hard-driven signal back down.

**Mix** blends between the original dry signal and the shaped wet signal (0% to 100%).

<md-tip>
  A straight diagonal line from (-1, -1) to (1, 1) leaves the wave untouched.
  Start from it and drag single points away to hear how each part of the curve
  changes the sound.
</md-tip>

## The curve

The curve is a list of up to 1024 points. The horizontal position of a point is an input level, and its height is the output level you get for that input. Full scale is at -1 and +1. The points are sorted from left to right automatically, so the order in which you draw them does not matter.

Between two neighboring points the curve is a straight line. Outside of the first and last point it stays flat at the height of that end point:

| Where the level lies    | Output of the curve                               |
| ----------------------- | ------------------------------------------------- |
| left of the first point | the height of the first point                     |
| between two points      | a straight line between the two points            |
| right of the last point | the height of the last point                      |
| no points at all        | the level itself, so the curve is a straight line |

## How it works

Every sample is multiplied by the **In** gain, looked up on the curve, and then multiplied by the **Out** gain. With <md-latex>g_{in} = 10^{\text{In}/20}</md-latex>, <md-latex>g_{out} = 10^{\text{Out}/20}</md-latex> and <md-latex>u = g_{in} \cdot x</md-latex>, and with <md-latex>C</md-latex> as the curve:

| Polarity | Wet signal                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bipolar  | <md-latex>g_{out} \cdot C(u)</md-latex>                                                                                                                                                                                                                             |
| Unipolar | <md-latex>g_{out} \cdot \operatorname{sign}(u) \cdot C'(\lvert u \rvert)</md-latex>, where <md-latex>C'</md-latex> is <md-latex>C</md-latex> with every point <md-latex>(x, y)</md-latex> moved to <md-latex>\left(\tfrac{x+1}{2}, \tfrac{y+1}{2}\right)</md-latex> |

The result is blended with the dry signal as <md-latex>\text{out} = x + \text{mix} \cdot (\text{wet} - x)</md-latex>. Note that the dry signal is blended in without the **In** and **Out** gains.

## Tutorial: drawing your own distortion

1. Drop a **Basic shapes** node set to Sine, then add a **Waveshaper** node and an **Output** node.
2. Connect Basic shapes to Waveshaper, and Waveshaper to the Output node.
3. Move the points of the curve in the node away from the diagonal and watch the spectrum fill with new harmonics.
4. Turn up **In** to push the sine further into the corners of the curve.
5. Switch **Polarity** to Unipolar and notice that the even harmonics disappear.

## Good to know

- With no points the curve is a straight line, so the node only applies the **In** and **Out** gains. With a single point the output is that one height for every input, a flat line.
- Because the curve stays flat beyond its end points, a high **In** gain clips the signal at the heights of the end points, like a hard clip. A curve that ends at (-1, -1) and (1, 1) clips at full scale.
- Two points at the same horizontal position make a vertical step in the curve. For levels at or past that position, the point that was drawn last wins.
- Corners in the curve create sharp bends in the wave, and with them a lot of upper harmonics. Harmonics above the highest bin of the frame fold back down as aliasing, so smooth curves with many points sound softer than a few straight segments.
- Unipolar always gives a mirrored result, so a sine only gets odd harmonics. Bipolar with a lopsided curve adds even harmonics and can also add a DC offset.
- In Unipolar the curve should reach 0 at its left end. Otherwise the output jumps every time the input crosses zero, because the sign flips at a curve height that is not 0.
- The output is not scaled afterwards, so the level and any DC offset are whatever the curve produces. Use **Out** or **Gain** to set the level.
- Like **Saturation**, Waveshaper works on a sample-by-sample basis in the time domain.

## The code

<md-lookup src="../graph/node/waveshaper.rs" />
