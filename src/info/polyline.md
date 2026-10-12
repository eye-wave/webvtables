Polyline draws a random zigzag of straight lines across the frame. Each point is placed at a random height, and the points are joined by straight segments. It needs no input, serving as a starting point for wavetable chains.

## Try it

<md-demo nodes='[["Polyline", { Points: 12, Seed: 3 }]]'></md-demo>

This is the real node, running. Drag the knobs to change Points and Seed and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Points** (2 to 128) sets how many corner points the line has. A few points make a simple, soft shape with a few long ramps. Many points make a jagged wave with a brighter sound.

**Seed** (0 to 65535) sets the random starting value. The same Seed and Points always give the same frame.

<md-tip>
  Two Polyline nodes with different Seeds can be blended with an **Add** node.
  Animate its **Crossfade** to glide smoothly between two random shapes.
</md-tip>

## How it works

For each point number <md-latex>i</md-latex> out of <md-latex>P</md-latex> (the value of **Points**), two random numbers <md-latex>r_x</md-latex> and <md-latex>r_y</md-latex> between 0 and 1 are drawn from the Wyrand generator, the same one the **Noise** node uses:

<md-latex>x_i = \dfrac{i}{P} + \dfrac{0.8 \thinspace r_x - 0.4}{P}, \qquad y_i = 2 r_y - 1</md-latex>

The points are spread evenly along the frame and each is moved sideways by at most 40% of the spacing, so they never swap order. The heights are anywhere between -1 and +1. Neighboring points are joined by straight lines, and the last point is joined back to the first one at the start of the next cycle, so there is no jump at the edge of the frame. Then the average is subtracted, and the whole frame is scaled so that its loudest sample reaches exactly <md-latex>\pm 1</md-latex>.

## Tutorial: your first random wave

1. Open the backpack and drag a **Polyline** node onto the grid, then add an **Output** node.
2. Connect Polyline to the Output node.
3. Change **Seed** to roll different shapes with the same number of corners.
4. Raise **Points** to make the wave rougher and brighter.

## Good to know

- With 2 Points the wave is a lopsided triangle, since there is one ramp up and one ramp down.
- The only sharp features are the corners, so the high harmonics fade quickly. Even with many points the spectrum is dominated by the low end.
- The average is removed, so there is no DC offset.
- Changing **Points** moves every point, so the shape changes completely. The same is true for **Seed**. Neither is a smooth morph, so use the crossfade trick from the tip for smooth movement.

## The code

<md-lookup src="../graph/node/polyline.rs" />
