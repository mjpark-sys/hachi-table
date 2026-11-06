# Hachi GLB character

The current character family is a simplified set of Korean grains.

## Locked visual language

- One-piece grain silhouette with a simple contrasting lower band.
- Tiny attached arms and feet, with no separate fingers or toes.
- No horns or animal ears.
- Dot eyes, a small open mouth, tongue, and flat blush decals.
- A subtle paper-grain texture on a smooth lightweight game mesh.
- Three genuinely different models selected from each player's `look` value: rounded rice, long curved oat, and low asymmetric black soybean.

## Runtime contract

`public/assets/characters/hachi.glb` contains all three player models. Stable node names let the game animate or replace parts without changing gameplay code:

- `Variant_Rice`, `Variant_Oat`, `Variant_BlackBean`
- `Body_Core`, `Lower_Band`
- `Eye_L`, `Eye_R`, `Mouth`
- `Arm_L`, `Arm_R`, `Foot_L`, `Foot_R`
- `Cheek_L`, `Cheek_R`

The current game keeps its existing lightweight procedural movement. If the GLB fails to load, a horn-free procedural character remains as a fallback.

## Rebuild

Run `npm run build:character`. This recreates the GLB from `scripts/build-hachi-glb.mjs`. A later Blender, Maya, or Houdini model can replace the same GLB as long as the stable node names and approximate 1.5-unit height remain unchanged.
