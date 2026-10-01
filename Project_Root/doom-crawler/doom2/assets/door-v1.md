# Exit door animation

Created with the built-in image generation tool. Runtime asset: `door-v1.png`, 256 x 64 pixels, four 64 x 64 frames, nearest-neighbor downsampled from generated artwork. Alpha outside the arch; opaque dark passage. Frames: closed, opening, mostly open, open.

Opens over 0.6 seconds within 1.5 tiles and clear line of sight, only with all required keys. Reverses when the player retreats. Floor transition requires full opening plus the existing entry distance. New floors reset the door. Rendering uses one clipped image draw and retains the procedural fallback while loading.

## Generation prompt

Generate a usable retro 8-bit dungeon door sprite atlas. Exactly FOUR equal columns in ONE row, 1536x384 canvas, no text, no labels, no grid. Transparent background outside the stone arches (real alpha). Each cell same perfectly stationary front-facing grey stone arched doorway, dark outline, chunky pixel art with limited earthy palette, brown wooden double doors with iron bands and brass handles. Entire arch fits within each equal square cell with transparent margins, identical size and position per cell. Cell1 fully closed wooden doors. Cell2 doors swung inward 30 degrees showing narrow black opening. Cell3 doors swung inward 65 degrees showing wider black opening. Cell4 fully open doors against inside jambs, black passage. Black passage must be opaque black, only outside arch transparent. Keep arch stationary across frames, no perspective changes to arch, crisp square pixels, suitable for downsampling each cell to 64x64. Medieval dungeon game animation asset.
