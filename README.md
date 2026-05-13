# Move Everything Dub FX

Dub-oriented overtake FX module for Move Everything on Ableton Move.

This fork starts from `schwung-performance-fx` and reshapes it into a live dub desk:

- Tape-style delay throws on the space row
- Reverb throws and dub verb variations
- Global DJ filter and tilt EQ
- 3-band isolator with kill behavior
- Default external MIDI mapping for Akai MIDImix

## Current Shape

This is a prototype fork intended for live testing on Move.

- The core overtake and punch-in behavior comes from `schwung-performance-fx`
- Delay/reverb rows are renamed and exposed as dub-focused throws
- MIDImix controls target the 8 space FX slots directly
- Isolator bands are implemented as global low/mid/high post-FX gains

## MIDImix Mapping

This build assumes the factory-style MIDImix CC layout:

- Knobs `30-37`, `38-45`, `46-53`: per-slot params for slots 16-23
- Faders `0-2`: low/mid/high isolator
- Fader `3`: dry/wet
- Fader `4`: tilt EQ
- Fader `5`: DJ filter
- Fader `6`: repeat length
- Fader `7`: repeat speed
- Master `54`: dry/wet
- Rec buttons `2-9`: momentary trigger for slots 16-23
- Mute buttons `12-19`: latch/unlatch slots 16-23
- Solo buttons `20-22`: low/mid/high kill
- Solo button `23`: bypass
- Solo buttons `24-27`: latch dub filter/siren slots

If your MIDImix has been edited in the Akai editor, adjust the constants near the top of [`src/ui.js`](/Users/justin/Documents/Codex/2026-05-13-https-github-com-charlesvestal-schwung-performance/repo-dub-fx/src/ui.js).

## Move Controls

- Pads: punch in FX
- Pressure: adds expression per slot
- Shift + pad: latch/unlatch
- Steps 1-3: low/mid/high kills
- Step 4: bypass
- E7: tilt EQ
- E8: DJ filter

## Build

Requires Docker for ARM64 cross-compilation:

```bash
./scripts/build.sh
./scripts/install.sh
```

## Next Ideas

- Swap the current delay core for `schwung-space-delay` style tape behavior
- Add dedicated siren DSP instead of relabeling filter motion slots
- Add external MIDI LED feedback if the host exposes a stable path for it

## License

MIT
