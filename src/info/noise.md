Noise generates randomized audio signals using a choice of algorithms and spectral colors, serving as another starting point for wavetable chains.

## Try it

<md-demo
nodes='[["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }]]'
/>

This is the real node, running. Drag the knobs to change the settings and watch the waveform and spectrum update. Double-click a knob to reset it.

## At a glance

<md-params />

## Parameters

**Algorithm** picks the pseudo-random number generator:

| Algorithm                                                                   | Effect                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| [Xorshift](https://en.wikipedia.org/wiki/Xorshift)                          | fast shift-register randomness                           |
| [Splitmix64](https://rosettacode.org/wiki/Pseudo-random_numbers/Splitmix64) | state-of-the-art hash-based generator                    |
| Wyrand                                                                      | fast and robust integer multiplication                   |
| Sfc64                                                                       | linear congruential state with a bit-rotating output mix |
| Wang_hash                                                                   | bit-mixing hash function                                 |
| [Jenkins](https://en.wikipedia.org/wiki/Jenkins_hash_function)              | hash-based pseudo-random sequence                        |
| [Lcg](https://en.wikipedia.org/wiki/Linear_congruential_generator)          | classic linear congruential generator                    |

**Color** shapes the frequency spectrum of the noise:

| Color                                                                | Effect                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [White](https://en.wikipedia.org/wiki/White_noise)                   | equal energy per frequency                                                                                       |
| [Pink](https://en.wikipedia.org/wiki/Pink_noise)                     | balanced energy drop per octave (-3 dB/oct)                                                                      |
| [Brown](https://en.wikipedia.org/wiki/Brownian_noise)                | heavier roll-off for a deep, rumbling sound (-6 dB/oct)                                                          |
| [Blue](https://en.wikipedia.org/wiki/Colors_of_noise#Blue_noise)     | energy rises with frequency (the difference between neighboring samples, about +6 dB/oct), clipped at full scale |
| [Violet](https://en.wikipedia.org/wiki/Colors_of_noise#Violet_noise) | the same rising slope as Blue (about +6 dB/oct), but halved before it is scaled so it is never clipped           |
| [Green](https://en.wikipedia.org/wiki/Colors_of_noise#Green_noise)   | speech-shaped band-limited noise                                                                                 |
| [Orange](https://en.wikipedia.org/wiki/Colors_of_noise#Orange_noise) | white-like noise with only the very lowest frequencies removed                                                   |
| [Grey](https://en.wikipedia.org/wiki/Colors_of_noise#Grey_noise)     | white-like noise with a gentle cut in the low end, a rough take on an equal-loudness curve                       |
| [Black](https://en.wikipedia.org/wiki/Colors_of_noise#Black_noise)   | a very slow random drift, a -6 dB/oct slope like Brown that is never clipped                                     |

**Seed** (1 to 99999) sets the random initial seed value. The same Seed always gives the same frame.

<md-tip>
  Using **Pink** or **Brown** noise provides a warm, organic foundation for
  ambient pads or percussion sounds when shaped through filters.
</md-tip>

## How it works

Noise fills the 2048-sample frame with numbers from the chosen **Algorithm**, scaled to the range <md-latex>[-1, 1]</md-latex>, and then shapes them with a simple filter for the chosen **Color**. With <md-latex>x_n</md-latex> as the white noise sample and <md-latex>y_n</md-latex> as the colored output:

| Color  | Filter                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| White  | <md-latex>y_n = x_n</md-latex>                                                                                  |
| Pink   | the sum of three one-pole low-pass filters of different speeds plus a little of <md-latex>x_n</md-latex>        |
| Brown  | <md-latex>y_n = 0.9995 \cdot (y_{n-1} + 0.02\thinspace x_n)</md-latex>, limited to <md-latex>[-1, 1]</md-latex> |
| Blue   | <md-latex>y_n = x_n - x_{n-1}</md-latex>, limited to <md-latex>[-1, 1]</md-latex>                               |
| Violet | <md-latex>y_n = 0.5 \cdot (x_n - x_{n-1})</md-latex>                                                            |
| Black  | <md-latex>y_n = 0.99999 \cdot (y_{n-1} + 0.0005\thinspace x_n)</md-latex>                                       |

The Green, Orange and Grey colors subtract one or more slow low-pass filters from the signal. Finally the whole frame is scaled so that its loudest sample reaches exactly <md-latex>\pm 1</md-latex>.

1. Open the backpack and drag a **Noise** node onto the grid, then add an **Output** node.
2. Connect the Noise output to the Output node.
3. Switch the **Color** parameter to Pink or Brown to hear a softer, less harsh texture compared to standard white noise.

## Good to know

- Like other source nodes, Noise requires no input. It is not truly random: the frame is fully determined by the **Seed** and the **Algorithm**, so every frame of the wavetable gets identical noise unless you animate the Seed in the keyframes panel.

## The code

<md-lookup src="../graph/node/noise.rs" />
