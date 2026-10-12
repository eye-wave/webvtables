Data loads assets such as audio files or images into the synthesis engine, allowing you to sequence and interpolate through custom frames of audio or spectral data over time.

## At a glance

<md-params />

## Parameters

**Frame** selects the current active frame index to read from the asset buffer (0.0 to 255.0).

**Interpolation** sets how the engine transitions between adjacent frames:

| Interpolation | Effect                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| Time          | linear crossfade sample by sample between frames                                      |
| Spectral      | polar interpolation separating magnitude and phase bins across the frequency spectrum |

### Asset UI Options

When loading an image asset, additional configuration settings become available in the node interface:

| Option       | Choices / Range              | Description                                                                                      |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| **Mode**     | Time, Spectral               | Determines whether image rows are parsed as raw time-domain waveforms or spectral magnitude bins |
| **Channel**  | Average, Red, Green, Blue    | Selects which color channel or average luminance is extracted from the image                     |
| **Resample** | Nearest, Linear, Cubic, Area | Sets the scaling and resampling algorithm used when fitting the image data                       |
| **Frames**   | 1 to 256 (or Auto)           | Sets the vertical resolution or number of sequential slices extracted from the asset             |

<md-tip>
  Using **Spectral** interpolation when morphing between different harmonic
  frames prevents phase cancellation artifacts and maintains consistent acoustic
  energy.
</md-tip>

## How it works

The Data node acts as a container for imported external assets like WAV audio or static images. It slices the loaded source data into sequential frames of 2048 samples each (1 to 256 frames). During processing, it reads the **Frame** parameter to pick the corresponding slice, performing fractional interpolation either directly in the time domain or via complex polar mixing in the frequency domain. With <md-latex>t</md-latex> as the fractional part of **Frame** and <md-latex>A</md-latex>, <md-latex>B</md-latex> as the two frames around it:

| Interpolation | Result                                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time          | <md-latex>y = (1 - t)\thinspace A + t\thinspace B</md-latex>                                                                                                                                                                                 |
| Spectral      | per bin, <md-latex>m = m_A + t\thinspace (m_B - m_A)</md-latex> and <md-latex>\varphi = \varphi_A + t\thinspace \Delta\varphi</md-latex>, with <md-latex>\Delta\varphi</md-latex> the phase difference taking the short way round the circle |

A **Frame** value past the last frame holds the last frame, and a Data node with nothing loaded outputs silence.

When an image is loaded, it undergoes row-by-row sampling where individual pixel rows are resampled and mapped directly into time-domain waveforms or spectral magnitude bins depending on the chosen mode.

## Tutorial: loading and playing custom frames

1. Add a **Data** node and an **Output** node onto the workspace grid.
2. Load an audio file or an image asset directly into the Data node interface.
3. Adjust the **Frame** parameter or automate it to sweep through the sequential slices of the loaded asset in real time.

## Good to know

- The asset data is kept in the engine state as one 2048-sample buffer per frame, so the node can read any frame directly during rendering. Loading a new asset replaces the previous one.

## The code

<md-lookup src="../graph/node/data.rs" />
