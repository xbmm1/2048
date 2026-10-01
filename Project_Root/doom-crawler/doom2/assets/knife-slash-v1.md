# Knife melee sprite

Created with built-in image generation using `pistol-fire.png` as the style reference. The five generated poses were extracted and packed into five 128 x 128 transparent cells (`knife-slash-v1.png`, 640 x 128) using nearest-neighbor scaling.

F triggers a 0.5-second swing, with one hit at 0.2 seconds. The nearest living enemy within 1.1 tiles and 45 degrees of aim receives 20 damage (40 with Damage active), subject to line of sight. Shooting is blocked during the swing. Animation and hit timing pause with gameplay; floor changes and new runs cancel the swing.

## Generation prompt

Create a NEW first-person knife slash sprite sheet matching the provided pistol sprite's retro DOOM pixel-art style, orange-brown armored glove, dark green/black trim and gritty steel shading. Replace pistol with a simple steel combat knife held by the same gloved right hand. Exactly FIVE equal cells in ONE horizontal row, each square, transparent background real alpha. Each cell includes hand and forearm entering from bottom, no body or enemies, no blood, no text. Five consecutive animation poses: 1 raising knife on right, 2 winding up on right, 3 slashing across center toward left with blade extended (impact), 4 follow-through left, 5 withdrawing down to right. Keep wrist proportions consistent and entire blade inside each cell; nothing crosses cell borders. Hard pixel edges, limited palette, designed for 128x128 logical pixels per frame, visually match supplied reference. No pistol anywhere.
