Spectral Gate suppresses frequency bins whose energy falls below a specified decibel threshold, acting as an FFT-based noise gate or surgical spectral dynamics processor.

## Try it

<md-demo
nodes='[
["Noise", { Algorithm: "Xorshift", Color: "White", Seed: 12345 }],
["Spectral Gate", { Threshold: -27.4, Mix: 100.0 }],
["Output"],
]'
/>

This is the real node, running. Connect an audio source to gate and attenuate quiet frequency components in real time.

## At a glance

<md-params />

## Parameters

**Threshold** sets the amplitude level below which frequency bins are attenuated (-80.0 dB to 10.0 dB). 0 dB is the level of a full-scale sine wave (amplitude 1) on a single harmonic, so a harmonic that is quieter than that is gated.

**Mix** controls the wet/dry balance of the spectral gating effect (0.0% to 100.0%).

<md-tip>
  Setting a moderate **Threshold** while keeping the **Mix** below 100% allows
  you to attenuate background noise or weak overtones without completely
  silencing them.
</md-tip>

## How it works

The Spectral Gate node transforms the incoming audio signal into the frequency domain using a Fast Fourier Transform (FFT). It calculates the magnitude of each frequency bin and compares it against the decibel-based **Threshold**. Bins falling at or below the threshold are scaled down by a floor factor determined by the **Mix** parameter, after which the spectrum is reconstructed back into the time domain via inverse FFT. With <md-latex>X_k</md-latex> as the bin of harmonic <md-latex>k</md-latex>:

<md-latex>Y_k = (1 - \text{mix}) \cdot X_k \text{ if } \lvert X_k \rvert \le T \cdot 1024, \quad Y_k = X_k \text{ otherwise}, \qquad T = 10^{\text{Threshold}/20}</md-latex>

The factor 1024 is half of the frame length and makes the 0 dB level match a full-scale sine. At a **Mix** of 100% the gated bins are removed completely.

Because frequency bins are gated independently without psychoacoustic smoothing, aggressive threshold settings can produce distinct musical artifacts that sound like low-bitrate MP3 digital compression noises or robotic quantization crackle.

## Tutorial: gating frequency bins

1. Drop a **Basic shapes** node and a **Spectral Gate** node onto the grid, alongside an **Output** node.
2. Connect the Basic shapes node into the input of the Spectral Gate node.
3. Route the output to the Output node and adjust the **Threshold** and **Mix** parameters to sculpt the harmonic content.

## Good to know

- Because gating operates on individual frequency bins rather than the overall signal amplitude, it can selectively remove background noise or carve out specific frequency regions with high precision.

## The code

<md-lookup src="../graph/node/spectral_gate.rs" />
