function parseRGB565Palette(uint8Array) {
    const colors = [];

    // Process 2 bytes at a time for 16-bit colors
    for (let i = 0; i < uint8Array.length; i += 2) {
        // Ensure we have a full 2-byte color
        if (i + 1 < uint8Array.length) {
            // Combine two bytes into a 16-bit value
            const colorValue = (uint8Array[i] << 8) | uint8Array[i + 1];

            // Extract color components
            const red =   (colorValue >> 11) & 0x1F;    // 5 bits for red
            const green = (colorValue >> 5)  & 0x3F;   // 6 bits for green
            const blue =  colorValue & 0x1F;           // 5 bits for blue

            // Convert to 8-bit color values
            const r8 = (red   * 255) / 31;
            const g8 = (green * 255) / 63;
            const b8 = (blue  * 255) / 31;

            colors.push({
                raw: colorValue,
                rgb: {
                    r: Math.round(r8),
                    g: Math.round(g8),
                    b: Math.round(b8)
                },
                hex: `#${Math.round(r8).toString(16).padStart(2, '0')}${Math.round(g8).toString(16).padStart(2, '0')}${Math.round(b8).toString(16).padStart(2, '0')}`
            });
        }
    }

    return colors;
}

// Your provided Uint8Array
const junkiePalette = Uint8Array.from([
    0x00, 0x00, 0xAA, 0x0A, 0x65, 0x0A, 0x44, 0x08, 0x22, 0x06, 0x20, 0x03, 0x40, 0x05, 0x87, 0x0C,
    0x76, 0x0B, 0x34, 0x03, 0x55, 0x09, 0x30, 0x04, 0x60, 0x07, 0x55, 0x04, 0x77, 0x07, 0xFF, 0x0F
]);
const gluePalette = Uint8Array.from([ // glue
    0x00, 0x00, 0x6C, 0x00, 0x39, 0x02, 0x4C, 0x02, 0x27, 0x02, 0x10, 0x07, 0x15, 0x01, 0x00, 0x04,
    0x10, 0x05, 0x20, 0x08, 0x00, 0x02, 0x30, 0x09, 0x55, 0x0B, 0xFF, 0x0F, 0x33, 0x0A, 0xFF, 0x0F
])

const palette = parseRGB565Palette(gluePalette);
console.log(palette);
