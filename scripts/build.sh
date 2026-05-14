#!/usr/bin/env bash
# Build Dub FX module for Move Anything (ARM64)
#
# Automatically uses Docker for cross-compilation if needed.
# Set CROSS_PREFIX to skip Docker (e.g., for native ARM builds).
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="move-anything-builder"
DOCKER_BIN="${DOCKER_BIN:-docker}"

if ! command -v "$DOCKER_BIN" >/dev/null 2>&1; then
    if [ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
        DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
    fi
fi

# Check if we need Docker
if [ -z "$CROSS_PREFIX" ] && [ ! -f "/.dockerenv" ]; then
    echo "=== Dub FX Module Build (via Docker) ==="
    echo ""

    if ! command -v "$DOCKER_BIN" >/dev/null 2>&1 && [ ! -x "$DOCKER_BIN" ]; then
        echo "Error: docker not found."
        echo "Install Docker Desktop or set DOCKER_BIN to a working docker CLI."
        exit 1
    fi

    TMP_TAR="$(mktemp /tmp/dub-fx-src.XXXXXX)"
    trap 'rm -f "$TMP_TAR"' EXIT

    echo "Packing source..."
    tar \
        --exclude='./.git' \
        --exclude='./build' \
        --exclude='./dist' \
        --exclude='./src/dsp/bungee' \
        --exclude='./src/dsp/pfx_bungee.cpp' \
        --exclude='./src/dsp/pfx_bungee.h' \
        -cf "$TMP_TAR" \
        -C "$REPO_ROOT" .

    # Build Docker image if needed
    if ! "$DOCKER_BIN" image inspect "$IMAGE_NAME" &>/dev/null; then
        echo "Building Docker image (first time only)..."
        "$DOCKER_BIN" build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$REPO_ROOT"
        echo ""
    fi

    # Run build inside container
    echo "Running build..."
    CONTAINER_ID="$("$DOCKER_BIN" create \
        -v "$TMP_TAR:/tmp/src.tar:ro" \
        -u "$(id -u):$(id -g)" \
        -w /tmp \
        "$IMAGE_NAME" \
        bash -lc 'rm -rf /tmp/dub-fx-build && mkdir -p /tmp/dub-fx-build && cd /tmp/dub-fx-build && tar -xf /tmp/src.tar && CROSS_PREFIX=aarch64-linux-gnu- ./scripts/build.sh')"
    trap '"$DOCKER_BIN" rm -f "$CONTAINER_ID" >/dev/null 2>&1 || true; rm -f "$TMP_TAR"' EXIT

    "$DOCKER_BIN" start -a "$CONTAINER_ID"

    rm -rf "$REPO_ROOT/dist"
    mkdir -p "$REPO_ROOT/dist"
    "$DOCKER_BIN" cp "$CONTAINER_ID:/tmp/dub-fx-build/dist/." "$REPO_ROOT/dist/"
    "$DOCKER_BIN" rm -f "$CONTAINER_ID" >/dev/null 2>&1 || true

    echo ""
    echo "=== Done ==="
    exit 0
fi

# === Actual build (runs in Docker or with cross-compiler) ===
CROSS_PREFIX="${CROSS_PREFIX:-aarch64-linux-gnu-}"

cd "$REPO_ROOT"

echo "=== Building Dub FX Module ==="
echo "Cross prefix: $CROSS_PREFIX"

# Create build directories
mkdir -p build
mkdir -p dist/dub-fx
mkdir -p dist/dub-fx/sirens
mkdir -p dist/dub-fx/springs

# Compile DSP plugin (C) and link everything
echo "Compiling DSP plugin..."
${CROSS_PREFIX}gcc -Ofast -fPIC \
    -march=armv8-a -mtune=cortex-a72 \
    -fomit-frame-pointer -fno-stack-protector \
    -DNDEBUG \
    -c src/dsp/perf_fx_plugin.c -o build/perf_fx_plugin.o \
    -Isrc/dsp
${CROSS_PREFIX}gcc -Ofast -fPIC \
    -march=armv8-a -mtune=cortex-a72 \
    -fomit-frame-pointer -fno-stack-protector \
    -DNDEBUG \
    -c src/dsp/perf_fx_dsp.c -o build/perf_fx_dsp.o \
    -Isrc/dsp

# Link final shared library
echo "Linking..."
${CROSS_PREFIX}gcc -shared -o build/dsp.so \
    build/perf_fx_plugin.o \
    build/perf_fx_dsp.o \
    -lm -lrt

# Copy files to dist (use cat to avoid ExtFS deallocation issues with Docker)
echo "Packaging..."
cat src/module.json > dist/dub-fx/module.json
cat src/ui.js > dist/dub-fx/ui.js
[ -f src/help.json ] && cat src/help.json > dist/dub-fx/help.json
cat build/dsp.so > dist/dub-fx/dsp.so
chmod +x dist/dub-fx/dsp.so
[ -f src/assets/vinyl_crackle.wav ] && cat src/assets/vinyl_crackle.wav > dist/dub-fx/vinyl_crackle.wav
for siren in src/assets/sirens/*.wav; do
    [ -f "$siren" ] || continue
    cat "$siren" > "dist/dub-fx/sirens/$(basename "$siren")"
done
for spring in src/assets/springs/*.aif src/assets/springs/*.wav; do
    [ -f "$spring" ] || continue
    cat "$spring" > "dist/dub-fx/springs/$(basename "$spring")"
done

# Create tarball for release
cd dist
tar -czvf dub-fx-module.tar.gz dub-fx/
cd ..

echo ""
echo "=== Build Complete ==="
echo "Output: dist/dub-fx/"
echo "Tarball: dist/dub-fx-module.tar.gz"
echo ""
echo "To install on Move:"
echo "  ./scripts/install.sh"
