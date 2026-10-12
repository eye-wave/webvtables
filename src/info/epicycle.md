Epicycle builds a waveform from a set of spinning arms laid tip to tail, like the circles-on-circles of a Fourier drawing machine. It needs no input, serving as a starting point for wavetable chains. Read more on [Deferent and epicycle](https://en.wikipedia.org/wiki/Deferent_and_epicycle) via Wikipedia.

## Try it

<md-demo
nodes='[["Epicycle", { Arms: 8, Decay: 0.7, Ratio: 2, Detune: 0.3, Phase: 0.0, Twist: 0.0 }]]'
/>

This is the real node, running. Drag the knobs to change the settings and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Arms** (1 to 64) sets how many spinning arms are added together.

**Decay** (0.0 to 2.0) sets how fast the arms get shorter. The first arm always has length 1, and the arm with number <md-latex>k + 1</md-latex> has length <md-latex>(k + 1)^{-\text{Decay}}</md-latex>. At 0 every arm is equally long, at 1 the lengths are 1, 1/2, 1/3 and so on.

**Ratio** (1 to 16) sets how much faster each arm spins than the one before it. The first arm makes 1 turn per frame, and each following arm makes Ratio more turns than the previous one:

| Ratio | Turns per frame of the arms | Sounds like                |
| ----- | --------------------------- | -------------------------- |
| 1     | 1, 2, 3, 4, 5 and so on     | a full harmonic series     |
| 2     | 1, 3, 5, 7, 9 and so on     | odd harmonics only, hollow |
| 3     | 1, 4, 7, 10, 13 and so on   | every third harmonic       |
| 16    | 1, 17, 33, 49 and so on     | widely spaced, bell-like   |

**Detune** (0.0 to 1.0) gives each arm a different starting angle, growing with the arm number. Arm <md-latex>k</md-latex> starts <md-latex>k \cdot \text{Detune}</md-latex> of a turn later than the first. Despite its name it does not change any pitch. A frame has to loop, so every arm has a whole number of turns, and Detune only moves the starting angles. A Detune of 1.0 is the same as 0.0.

**Phase** (0.0 to 1.0) rotates the starting angle of every arm by the same amount, in turns. A Phase of 1.0 is the same as 0.0, and 0.5 turns the whole wave upside down.

**Twist** (-1.0 to 1.0) also changes the starting angles, but in proportion to the square of the arm number, so the outer arms are rotated far more than the inner ones. Negative values twist the other way.

<md-tip>
  Arms, Decay and Ratio decide which harmonics exist and how loud they are.
  Detune, Phase and Twist only move starting angles, so the spectrum keeps the
  same shape while the waveform changes. They are good targets for keyframe
  lanes when you want movement without a change in tone color.
</md-tip>

## How it works

Arm <md-latex>k</md-latex> (counting from 0) spins <md-latex>1 + kR</md-latex> times per frame, where <md-latex>R</md-latex> is **Ratio**, and has length <md-latex>(k+1)^{-d}</md-latex>, where <md-latex>d</md-latex> is **Decay**. Its starting angle, in turns, is

<md-latex>\theta_k = P + k \thinspace D + T \thinspace \dfrac{k^2}{A}</md-latex>

with <md-latex>P</md-latex> as **Phase**, <md-latex>D</md-latex> as **Detune**, <md-latex>T</md-latex> as **Twist** and <md-latex>A</md-latex> as **Arms**. Adding the arms tip to tail gives a point that moves across the plane, with horizontal position <md-latex>X_n</md-latex> and vertical position <md-latex>Y_n</md-latex>. The output is that point projected onto the 45° diagonal:

<md-latex>y_n = \dfrac{X_n + Y_n}{\sqrt{2}} = \sum_{k=0}^{A-1} (k+1)^{-d} \thinspace \sin\left(\dfrac{2\pi (1 + kR)\thinspace n}{2048} + 2\pi\theta_k + \dfrac{\pi}{4}\right)</md-latex>

The sines are read from a table of 2048 positions, so each starting angle is rounded to the nearest of those positions. Finally the whole frame is scaled so that its loudest sample reaches exactly <md-latex>\pm 1</md-latex>.

## Tutorial: spinning up a timbre

1. Open the backpack and drag an **Epicycle** node onto the grid, then add an **Output** node.
2. Connect Epicycle to the Output node.
3. Raise **Arms** and lower **Decay** to bring in more and louder upper harmonics.
4. Change **Ratio** from 1 to 2 and watch every second harmonic disappear.
5. Sweep **Detune** and **Twist**. The spectrum stays put, but the wave changes shape and the sharp peak spreads out.

## Good to know

- With Phase, Detune and Twist all at 0, every arm starts at the same angle, so they pile up into one tall peak near the start of the frame. Detune and Twist spread the arms apart and flatten that peak.
- The highest harmonic is <md-latex>1 + (A - 1) R</md-latex>, which is at most <md-latex>1 + 63 \cdot 16 = 1009</md-latex>. That is below the 1024 bins of a frame, so unlike **Partials** this node can never alias.
- **Partials** adds sines of equal strength on harmonics you choose. Epicycle adds a level fade through Decay and control over the phase of every harmonic.
- Because the phase knobs change the shape of the wave, the final scaling to <md-latex>\pm 1</md-latex> changes the overall level between settings, even though the harmonics keep the same proportions.

## The code

<md-lookup src="../graph/node/epicycle.rs" />
