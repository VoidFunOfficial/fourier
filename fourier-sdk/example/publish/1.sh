#!/usr/bin/env bash

set -u

for dir in */; do
    # 当前目录没有子文件夹时跳过
    [ -d "$dir" ] || continue

    # 去掉末尾的 /
    name="${dir%/}"

    echo "========================================"
    echo "Publishing: $name"
    echo "========================================"

    if bun run /Users/voidfun/Project/Fourier-Project/fourier-sdk/src/cli.ts publish "$name"; then
        echo "✓ Published successfully: $name"
    else
        echo "✗ Publish failed: $name"
    fi

    echo
done

echo "All folders processed."