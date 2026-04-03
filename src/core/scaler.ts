// typedef void (*ScaleProc32)(int factor, uint32_t *dst, int dstPitch, const uint32_t *src, int srcPitch, int w, int h);
type ScaleProc32 = (factor: number, dst: ArrayBuffer, dstPitch: number, src: ArrayBuffer, srcPitch: number, w: number, h: number) => void

enum ScalerType {
	kScalerTypePoint,
	kScalerTypeLinear,
	kScalerTypeInternal,
	kScalerTypeExternal,
};

const scalerTag = 1

interface Scaler {
	tag: number
	name: string
	factorMin: number
    factorMax: number
	scale: ScaleProc32 
}

// This code appears to be implementing a pixel art scaling algorithm, specifically the "Scale2x" algorithm (also known as "EPX" or "Eric's Pixel Expansion").
// The method processes one horizontal line of pixels at a time to create a scaled-up version of the image by a factor of 2 `scanline2x`
const scanline2x = (dst0: Uint32Array, dst1: Uint32Array, src0: Uint32Array, src1: Uint32Array, src2: Uint32Array, w: number) => {
	let B, D, E, F, H

	// ABC
	// DEF
	// GHI

	let x = 0;
	let dst0I = 0
	let dst1I = 0

	// first pixel (D == E)
	B = src0[x] // *(src0 + x);
	E = src1[x] // *(src1 + x);
	D = E
	F = src1[x + 1] // *(src1 + x + 1);
	H = src2[x] // *(src2 + x);
	if (B != H && D != F) {
		dst0[0] = D == B ? D : E;
		dst0[1] = B == F ? F : E;
		dst1[0] = D == H ? D : E;
		dst1[1] = H == F ? F : E;
	} else {
		dst0[0] = E;
		dst0[1] = E;
		dst1[0] = E;
		dst1[1] = E;
	}
	dst0I += 2;
	dst1I += 2;

	// center pixels
	E = F;
	for (x = 1; x < w - 1; ++x) {
		B = src0[x] // *(src0 + x);
		F = src1[x + 1] // *(src1 + x + 1);
		H = src2[x] //*(src2 + x);
		if (B != H && D != F) {
			dst0[0 + dst0I] = D == B ? D : E;
			dst0[1+ dst0I] = B == F ? F : E;
			dst1[0 + dst1I] = D == H ? D : E;
			dst1[1 + dst1I] = H == F ? F : E;
		} else {
			dst0[0 + dst0I] = E;
			dst0[1 + dst0I] = E;
			dst1[0 + dst1I] = E;
			dst1[1 + dst1I] = E;
		}
		D = E; E = F;
		dst0I += 2;
		dst1I += 2;
	}

	// last pixel (F == E)
	B = src0[0] // *(src0 + x);
	H = src2[x] // *(src2 + x);
	if (B != H && D != F) {
		dst0[0 + dst0I] = D == B ? D : E;
		dst0[1 + dst1I] = B == F ? F : E;
		dst1[0 + dst0I] = D == H ? D : E;
		dst1[1 + dst1I] = H == F ? F : E;
	} else {
		dst0[0 + dst0I] = E;
		dst0[1 + dst1I] = E;
		dst1[0 + dst0I] = E;
		dst1[1 + dst1I] = E;
	}
}

const scale2x = (dst: Uint32Array, dstPitch: number, src: Uint32Array, srcPitch: number, w: number, h: number) => {
	if (w <= 1 || h <= 1) {
		throw 'scale2x: w <= 1 || h <= 1 !!'
	}

	const dstPitch2 = dstPitch * 2;

	// y == 0
	let src0 = src;
	let src1 = src;
	let src2 = new Uint32Array(src.buffer, srcPitch)
	scanline2x(dst, new Uint32Array(dst.buffer, dstPitch), src0, src1, src2, w);
	let dst2 = new Uint32Array(dst.buffer, dstPitch2)

	// center
	src0 = src;
	src1 = new Uint32Array(src.buffer, srcPitch)
	src2 = new Uint32Array(src, srcPitch * 2)
	for (let y = 1; y < h - 1; ++y) {
		scanline2x(dst2, new Uint32Array(dst2.buffer, dstPitch), src0, src1, src2, w)
		dst2 = new Uint32Array(dst2.buffer, dstPitch2)

		src0 = new Uint32Array(src0.buffer, srcPitch)
		src1 = new Uint32Array(src1.buffer, srcPitch)
		src2 = new Uint32Array(src2.buffer, srcPitch)
	}

	// y == h-1
	src2 = src1
	scanline2x(dst2, new Uint32Array(dst2.buffer, dstPitch), src0, src1, src2, w)
}

const scaleNx = (factor: number, dst: Uint32Array, dstPitch: number, src: Uint32Array, srcPitch: number, w: number, h: number) => {
	switch (factor) {
	case 2:
		return scale2x(dst, dstPitch, src, srcPitch, w, h);
	}
}

const _internalScaler: Scaler  = {
	tag: scalerTag,
	name: "scaleNx",
	factorMin: 2,
	factorMax: 4,
	scale: scaleNx,
}


export { ScalerType, Scaler, ScaleProc32, _internalScaler }