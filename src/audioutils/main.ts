import {FileSystem} from "./fs"
import {FIB_Loader} from "./resource-loader";

function createWavFile(audioData, sampleRate = 6000, bitsPerSample = 8) {
    // WAV header
    const numChannels = 1; // Mono
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const subchunk2Size = audioData.length;
    const chunkSize = 36 + subchunk2Size;

    // Create the WAV header buffer
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // "RIFF" chunk descriptor
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));

    // Chunk size
    view.setUint32(4, chunkSize, true);

    // "WAVE" format
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));

    // "fmt " subchunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));

    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    // "data" subchunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));

    view.setUint32(40, subchunk2Size, true); // Subchunk2Size

    // Combine header and audio data
    const wavArray = new Uint8Array(header.byteLength + audioData.length);
    wavArray.set(new Uint8Array(header), 0);
    wavArray.set(audioData, header.byteLength);

    return wavArray;
}

let allfxdata

(async () => {
    const fs = new FileSystem()
    //await fs.setRootDirectory('.')
    const fib_loader = new FIB_Loader()
    //init
    allfxdata = await fib_loader.load_FIB(fs)

    // Loop through all items in allfxdata
    const fs2 = require('fs');

    allfxdata.forEach((item, index) => {
        try {
            const audio_data: Int8Array = item.data;
            const filename = `output_${index}.pcm_u8`;

            fs2.writeFileSync(filename, Buffer.from(audio_data), {
                encoding: 'binary'
            });

            console.log(`File saved to ${filename}`);
        } catch (error) {
            console.error(`Error processing item ${index}:`, error);
        }
    });


})();



