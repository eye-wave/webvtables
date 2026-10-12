Convolve multiplies the frequency spectra of two audio signals together or divides them via [deconvolution](https://en.wikipedia.org/wiki/Deconvolution), enabling impulse response reverb and spectral cross-filtering. Read more on [Convolution](https://en.wikipedia.org/wiki/Convolution) via Wikipedia.

## Try it

<md-demo
nodes='[
["Basic shapes", { Shape: "Sawtooth" }],
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["Convolve", { Mode: "Convolve", Gain: 0.05, Reg: 1e-2 }],
]'
/>

This is the real node, running. Connect two sources to process them through convolution or deconvolution in real time.

## At a glance

<md-params />

## Parameters

**Mode** selects the mathematical operation:

| Mode       | Effect                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| Convolve   | multiplies frequency spectra to apply spectral coloring or impulse responses      |
| Deconvolve | divides frequency spectra to reverse filtering or extract impulse characteristics |

**Gain** scales the amplitude of the output signal (0.0 to 1.0).

**Reg** (regularization) adds a tiny epsilon floor to prevent division by zero during deconvolution (1e-6 to 1.0).

<md-tip>
  Using **Convolve** mode with a rhythmic noise burst and a tonal sound lets you
  imprint the acoustic texture of one onto the other.
</md-tip>

## How it works

Convolve transforms both input signals into the frequency domain using the Fast Fourier Transform (FFT). In **Convolve** mode, it multiplies the complex spectrum of the first input by the second input, which corresponds to convolution in the time domain-effectively applying the frequency characteristics (such as a room's reverb or an acoustic filter) of one signal onto another. In **Deconvolve** mode, it divides the spectra instead, reversing the filtering process or estimating the transfer function between the two signals while using the **Reg** parameter to maintain mathematical stability.

## Tutorial: combining signals via convolution

1. Drop a **Basic shapes** node and a **Noise** node onto the grid, then add a **Convolve** node and an **Output** node.
2. Connect Basic shapes to the first input and Noise to the second input of the Convolve node.
3. Adjust the **Gain** knob to control the output volume and listen to how the frequency contents blend together.

## Good to know

- Because frequency-domain multiplication is mathematically equivalent to time-domain convolution, this node provides an efficient way to achieve complex acoustic filtering without heavy processing overhead.
