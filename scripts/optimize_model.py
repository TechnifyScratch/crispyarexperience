"""Convert the source Craig STL into a mobile-friendly GLB.

Run with a Python environment containing `trimesh` and `fast-simplification`.
The source STL remains the geometry master; the GLB is the web delivery asset.
"""

from pathlib import Path

import trimesh


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/crispy-craig.stl"
OUTPUT = ROOT / "public/models/crispy-craig.glb"
TARGET_FACES = 40_000


def main() -> None:
    mesh = trimesh.load_mesh(SOURCE, process=True)
    if not isinstance(mesh, trimesh.Trimesh):
        mesh = mesh.dump(concatenate=True)

    original_faces = len(mesh.faces)
    if original_faces > TARGET_FACES:
        mesh = mesh.simplify_quadric_decimation(face_count=TARGET_FACES)

    mesh.remove_unreferenced_vertices()
    OUTPUT.write_bytes(trimesh.exchange.gltf.export_glb(mesh))
    print(f"Optimized {original_faces:,} faces to {len(mesh.faces):,} faces")
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size / 1_000_000:.2f} MB)")


if __name__ == "__main__":
    main()
