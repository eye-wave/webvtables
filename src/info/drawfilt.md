Draw Filter lets you paint a filter by hand. You draw a curve over the spectrum of the wave, and every harmonic is boosted or cut by the height of the curve at its position. It is the free-form version of **FFT Filter**, which only offers fixed filter shapes.

## At a glance

<md-params />

## Parameters

**Mix** blends between the original signal and the filtered signal (0% to 100%). At 0% the node passes the input through unchanged.

**Scale** sets how many decibels the curve can boost (from 3 dB to 60 dB). A curve height of +1, the top of the display, boosts by Scale, a height of 0 leaves the harmonic alone, and a height of -1, the bottom of the display, removes it completely.

**Axis** picks how the frequencies are spread across the width of the display:

| Axis   | Effect                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| Log    | a bent scale that gives the low harmonics much more room, good for shaping the fundamental and the first harmonics |
| Linear | all harmonics get the same amount of room, good for shaping the upper spectrum                                     |

With Log, the left half of the display covers harmonics 1 to about 247, and the right half covers the remaining 770 or so. With Linear, the halves split at harmonic 512. The labels along the bottom of the display show the harmonic numbers.

<md-tip>
  Changing **Axis** does not move your drawing, it only stretches it across a
  different range of harmonics. If you want to keep what you drew, choose the
  axis first.
</md-tip>

## The display

The node shows two shaded spectra behind the curve. One is the spectrum of the input and the other is the spectrum after filtering. Both are drawn relative to the strongest harmonic of the input, over a range of 60 dB, so you can see directly what your drawing does to the sound. Each column shows the loudest harmonic in its range, so narrow peaks never disappear. Harmonics that get boosted above the strongest input harmonic are drawn at the top edge.

The numbers on the left are decibels, from +Scale at the top to -Scale at the bottom. The curve is level at 0 dB in the middle.

## Drawing tools

Three buttons above the display change how the mouse works:

| Tool    | Effect                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pencil  | drag over the display to paint the curve. Fast strokes are joined with straight lines, so they leave no gaps. Hold **Shift** while dragging to paint the curve back to the 0 dB line |
| Smooth  | drag over the curve to even it out. Every touched point is replaced by the average of itself and its four neighbors                                                                  |
| Flatten | the reset button sets the whole curve back to 0 dB, which leaves the sound unchanged                                                                                                 |

<md-tip>
  Drag along the very bottom edge with the Pencil to remove a range of
  harmonics completely, and use Smooth afterwards to round off any steep edges.
</md-tip>

## How it works

The curve has 256 points, each with a height between -1 and +1. Draw Filter transforms the 2048 samples of the input into 1023 harmonics (plus DC), multiplies every harmonic by a gain taken from the curve, and transforms the result back. Only the level of each harmonic changes. Its phase stays as it was.

For harmonic <md-latex>k</md-latex>, let <md-latex>u = (k - 1) / 1022</md-latex> be its position from 0 to 1 along the frequency range. Its position <md-latex>t</md-latex> along the curve depends on **Axis**:

| Axis   | Position on the curve <md-latex>t</md-latex>                               |
| ------ | -------------------------------------------------------------------------- |
| Linear | <md-latex>t = u</md-latex>                                                 |
| Log    | <md-latex>t = \dfrac{\ln\left(1 + u\,(e^{2.3} - 1)\right)}{2.3}</md-latex> |

The height <md-latex>y</md-latex> is read from the curve at <md-latex>255\,t</md-latex> with a straight line between the two neighboring points. With <md-latex>S</md-latex> as **Scale** and <md-latex>m</md-latex> as **Mix** divided by 100, the gain and the factor that multiplies the harmonic are

<md-latex>g = \begin{cases} 0 & y \le -1 \\ 10^{\,y S / 20} & \text{otherwise} \end{cases} \qquad \text{factor} = 1 + m\,(g - 1)</md-latex>

DC, the first bin, follows the first point of the curve. The table shows where the display positions land, to give you a feel for the two axes:

| Position along the display | Harmonic with Log | Harmonic with Linear |
| -------------------------- | ----------------- | -------------------- |
| left edge                  | 1                 | 1                    |
| a quarter of the way       | about 90          | about 257            |
| halfway                    | about 247         | 512                  |
| three quarters             | about 526         | about 768            |
| right edge                 | 1023              | 1023                 |

## Tutorial: painting a filter

1. Drop a **Basic shapes** node set to Sawtooth, then add a **Draw Filter** node and an **Output** node.
2. Connect Basic shapes to Draw Filter, and Draw Filter to the Output node.
3. Use the Pencil to draw a hump over the harmonics you want to boost, and watch the second shaded spectrum follow your drawing.
4. Drag along the bottom edge to remove a range of harmonics, then switch to Smooth to round off the edges.
5. Try **Scale** to make the boosts stronger or gentler, and **Mix** to blend the effect in.

## Good to know

- A flat curve at 0 dB, and a node with no drawing yet, leave the sound unchanged.
- The bottom label says -Scale, but the very bottom edge is a complete cut, not a cut of Scale dB. A curve height just above the bottom, such as -0.99, only cuts by about Scale dB. Only a range where neighboring points both sit exactly at the bottom is silenced.
- **Mix** blends the filtered signal with the original as plain amplitudes, not decibels. A fully cut harmonic at 50% Mix is turned down to half its amplitude (-6 dB), not removed.
- The output is not scaled afterwards, so boosts raise the level of the wave, and Scale goes up to +60 dB, which is 1000 times. Use **Gain** to bring the level back.
- With Log, each point of the curve covers about one harmonic at the left edge and about ten at the right edge. With Linear, each point covers four harmonics everywhere. Draw at the highest resolution where you need it.
- Because only the levels change, the filter has no ringing and does not shift the phase of any harmonic.

## The code

<md-lookup src="../graph/node/draw_filter.rs" />
