Amplitude Modulation multiplies a carrier signal by a modulator signal scaled by a depth parameter, creating sideband frequencies and classic tremolo or ring-modulation-like effects. Unlike Ring Modulation, the original carrier is kept in the output. Read more on [Amplitude modulation](https://en.wikipedia.org/wiki/Amplitude_modulation) via Wikipedia.

## Try it

<md-demo nodes='[["Basic shapes",{Shape:"Sine"}],["Noise",{Algorithm:"Xorshift",Color:"White",Seed:12345}],["Amplitude Modulation",{ Depth:1}]]'/>

## At a glance

<md-params />

## Parameters

**Depth** sets the modulation depth or intensity of the amplitude scaling effect (0.0 to 1.0).

<md-tip>
  Setting the **Depth** to 1.0 applies full modulation swing, completely scaling
  the carrier amplitude by the modulating signal.
</md-tip>

## How it works

The Amplitude Modulation node takes two input buffers, a carrier signal and a modulator signal, and processes them sample by sample. It scales the modulator value by the **Depth** parameter, adds 1.0, and multiplies it directly with the carrier signal, generating upper and lower frequency sidebands around the carrier's frequency spectrum. With <md-latex>c</md-latex> as the carrier, <md-latex>m</md-latex> as the modulator and <md-latex>d</md-latex> as **Depth**:

<md-latex>y_n = c_n \cdot (1 + d \cdot m_n)</md-latex>

At a Depth of 0 the carrier passes through unchanged. For a sine modulator on harmonic <md-latex>k_m</md-latex> and a sine carrier on harmonic <md-latex>k_c</md-latex>, the output holds the carrier itself plus the sidebands <md-latex>k_c + k_m</md-latex> and <md-latex>\lvert k_c - k_m \rvert</md-latex>.

## Tutorial: modulating carrier signals

1. Drop a **Basic shapes** node (set to Sine) and a **Noise** node onto the grid, alongside an **Amplitude Modulation** node and an **Output** node.
2. Connect the Basic shapes node into input `0` (carrier) and the Noise node into input `1` (modulator) of the Amplitude Modulation node.
3. Route the output to the Output node and adjust the **Depth** parameter to control the modulation strength.

## Good to know

- Because amplitude modulation creates new sidebands based on the sum and difference of the input frequencies, using low-frequency control signals produces rhythmic tremolo while audio-rate modulators generate metallic, bell-like timbre shifts.

## The code

<md-lookup src="../graph/node/am.rs" />
