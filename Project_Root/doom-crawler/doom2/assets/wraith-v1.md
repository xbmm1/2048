# Dungeon wraith atlas

Generated using the built-in image generation tool, then mechanically resized with nearest-neighbor sampling to 192 x 128 pixels. Transparent PNG; six columns and four rows of 32 x 32 cells. Ranged enemies use a renderer hue shift. No external asset service is required at runtime.

Rows: float (6 frames at 8 fps), attack (first 4 frames at 10 fps), hurt (first 2 frames over 0.25 seconds), death (6 frames at 10 fps). Unused cells in attack/hurt rows are ignored. Death disables gameplay immediately and retains only the visual for 0.6 seconds. The procedural ghost remains the asset-loading fallback.

## Generation prompt

Create a production game animation sprite sheet, transparent background, no text, no grid lines, exactly 6 equal columns by 4 equal rows, canvas 1536 wide by 1024 high. Each cell 256x256 represents a chunky 32x32 pixel-art sprite enlarged exactly 8x with nearest neighbor, limited 8-bit palette, no antialiasing. One consistent front-facing dungeon wraith: torn icy cyan hood and robes, shadow-black face, two luminous cyan eyes, claw-like sleeves, ragged floating bottom, dark navy outline. Same center, same scale, full figure within every cell, generous transparent margins. Row 1: six consecutive seamlessly looping float frames, rippling hem. Row 2: four consecutive attack frames reaching both arms forward, then repeat last pose in cells 5 and 6. Row 3: two hurt recoil poses then repeat second pose in remaining four cells. Row 4: six death frames, intact wraith collapsing then dissolving into progressively fewer cyan square fragments, final frame only a few tiny sparks. Strict uniform cell alignment, no accessories, no ground, no shadows outside character. This is an actual sprite atlas for a retro first-person dungeon game.

## Transparency refinement prompt

Remove the blue background completely to real alpha transparency from this sprite sheet. Preserve all 24 sprites exactly in their existing positions, six columns and four rows, same canvas dimensions. Preserve dark outlines and black faces. No colored background, no gradient, no checkerboard drawn in image. All space between sprites must have alpha zero.
