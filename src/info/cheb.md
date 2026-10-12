Chebyshev builds a waveform out of harmonics generated with [Chebyshev polynomials](https://en.wikipedia.org/wiki/Chebyshev_polynomials). It needs no input, serving as a starting point for wavetable chains.

## Try it

<md-demo
nodes='[["Chebyshev", { Count: 12, Slope: 1.0, Select: "All", Sign: "Same" }]]'
/>

This is the real node, running. Drag the knobs to change the settings and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Count** (1 to 256) sets the highest harmonic that is generated. With **Select** on All, every harmonic from 1 up to Count is added.

**Slope** (0.0 to 3.0) sets how quickly the higher harmonics fade. Harmonic number <md-latex>h</md-latex> gets the level <md-latex>h^{-\text{Slope}}</md-latex>:

| Slope | Harmonic levels                                    |
| ----- | -------------------------------------------------- |
| 0     | every harmonic equally loud, a very bright wave    |
| 1     | 1, 1/2, 1/3 and so on, the same fade as a sawtooth |
| 2     | 1, 1/4, 1/9 and so on, a soft wave                 |
| 3     | 1, 1/8, 1/27 and so on, almost only the lowest few |

**Select** picks which harmonics are used:

| Select | Effect                                                                                     |
| ------ | ------------------------------------------------------------------------------------------ |
| All    | harmonics 1, 2, 3, 4 and so on                                                             |
| Odd    | only harmonics 1, 3, 5 and so on, a hollow sound                                           |
| Even   | only harmonics 2, 4, 6 and so on, which repeats twice per frame, so it sounds an octave up |

**Sign** picks how the signs of the harmonics are arranged:

| Sign      | Effect                                                      |
| --------- | ----------------------------------------------------------- |
| Same      | every harmonic keeps its sign                               |
| Alternate | every even-numbered harmonic is flipped (2, 4, 6 and so on) |

<md-tip>
  Sign does not change which harmonics are present or how loud they are, only the
  shape of the wave. The difference becomes audible when you follow Chebyshev
  with a node that reacts to wave shape, such as **Saturation**.
</md-tip>

## How it works

Chebyshev takes one cycle of a sine, <md-latex>x_n = \sin(2\pi n / 2048)</md-latex>, and sends it through the Chebyshev polynomial <md-latex>T_h</md-latex> of every harmonic number <md-latex>h</md-latex> that **Select** allows. The polynomials come from the recurrence

<md-latex>T_1(x) = x, \qquad T_2(x) = 2x^2 - 1, \qquad T_{h+1}(x) = 2x\thinspace T_h(x) - T_{h-1}(x)</md-latex>

and the results are added up with the level <md-latex>a_h = \pm h^{-\text{Slope}}</md-latex>:

<md-latex>y_n = \sum_h a_h \thinspace T_h(x_n)</md-latex>

The useful property of these polynomials is that <md-latex>T_h(\cos\varphi) = \cos(h\varphi)</md-latex>. Because a sine is a shifted cosine, <md-latex>T_h(\sin\theta) = \cos(h\theta - h\pi/2)</md-latex>, which is a single clean harmonic number <md-latex>h</md-latex> and nothing else. The phase of each harmonic turns by 90° from one to the next, so the pattern repeats every four harmonics: <md-latex>\sin\theta, \thinspace -\cos 2\theta, \thinspace -\sin 3\theta, \thinspace \cos 4\theta</md-latex>.

With **Sign** on Alternate, <md-latex>a_h</md-latex> is negated for every even <md-latex>h</md-latex>. Finally the whole frame is scaled so that its loudest sample reaches exactly <md-latex>\pm 1</md-latex>.

## Tutorial: your first Chebyshev wave

1. Open the backpack and drag a **Chebyshev** node onto the grid, then add an **Output** node.
2. Connect Chebyshev to the Output node.
3. Raise **Count** and watch the spectrum grow one harmonic at a time.
4. Switch **Select** to Odd for a hollow tone, then turn **Slope** up to soften it.
5. Try **Sign** on Alternate and notice that the spectrum stays the same while the waveform changes.

## Good to know

- Each harmonic lands exactly on its own frequency bin, and even the highest Count of 256 stays far below the 1024 bins a frame can hold, so nothing aliases.
- Every harmonic averages out to zero, so the output has no DC offset.
- Sign has no effect with **Select** on Odd, because there are no even harmonics to flip. With Even it only flips the polarity of the whole wave.
- Select on Even with a Count of 1 leaves no harmonics at all (harmonic 1 is odd), so the output is silent.
- Every harmonic is computed with the polynomial recurrence at every sample, so the work grows with the square of Count. Count 256 costs roughly 240 times as much as Count 16, which is worth keeping in mind when many frames are rendered.

## The code

<md-lookup src="../graph/node/chebyshev.rs" />
