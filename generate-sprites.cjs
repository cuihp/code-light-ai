#!/usr/bin/env node
// Generate pixel art sprite sheets for Code Light desktop pet
// Each sprite is 64x64 pixels, frames are laid out horizontally
// Focus: BIG visible animation differences between frames

const fs = require('fs');
const zlib = require('zlib');

const W = 64, H = 64;

function createPNG(width, height, rgbaData) {
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0;
    rgbaData.copy(rawData, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const deflated = zlib.deflateSync(rawData);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(crcData));
    return Buffer.concat([len, typeB, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { if (c & 1) c = 0xEDB88320 ^ (c >>> 1); else c = c >>> 1; }
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) | 0;
}

function createSpriteSheet(frames) {
  const totalW = frames.length * W;
  const data = Buffer.alloc(totalW * H * 4);
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const srcIdx = (y * W + x) * 4;
        const dstIdx = (y * totalW + i * W + x) * 4;
        data[dstIdx] = frame[srcIdx];
        data[dstIdx + 1] = frame[srcIdx + 1];
        data[dstIdx + 2] = frame[srcIdx + 2];
        data[dstIdx + 3] = frame[srcIdx + 3];
      }
    }
  }
  return createPNG(totalW, H, data);
}

function createFrame() { return Buffer.alloc(W * H * 4); }

function px(frame, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  frame[i] = r; frame[i+1] = g; frame[i+2] = b; frame[i+3] = a;
}

function rect(frame, x1, y1, w, h, r, g, b, a = 255) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      px(frame, x1 + dx, y1 + dy, r, g, b, a);
}

function ellipse(frame, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++)
      if (dx*dx*ry*ry + dy*dy*rx*rx <= rx*rx*ry*ry)
        px(frame, cx + dx, cy + dy, r, g, b, a);
}

function clearRect(frame, x1, y1, w, h) {
  rect(frame, x1, y1, w, h, 0, 0, 0, 0);
}

// Colors
const BODY = [255, 200, 150];     // warm orange-tan cat
const DARK = [200, 140, 90];      // darker outline
const BELLY = [255, 235, 210];    // light belly
const EYE = [30, 30, 40];         // dark eyes
const WHITE = [255, 255, 255];
const NOSE = [255, 140, 140];     // pink nose
const EAR_IN = [255, 180, 180];   // inner ear pink
const GREEN = [80, 220, 100];
const YELLOW = [255, 220, 50];
const RED = [240, 60, 50];
const BLUE = [70, 150, 255];
const CODE = [100, 255, 130];
const STAR_C = [255, 240, 80];
const SWEAT = [120, 200, 255];

// =============================================
// Draw a full cat with given offsets and options
// =============================================
function drawCat(frame, ox = 0, oy = 0, opts = {}) {
  const { closedEyes = false, bigEyes = false, happyMouth = false,
          raisedPaws = false, openMouth = false, earsBack = false,
          tailUp = false, tailWag = 0, xeyes = false } = opts;

  // Tail (drawn first, behind body)
  const tailBase = tailUp ? -4 : 0;
  const tw = tailWag;
  if (tailUp) {
    // Tail goes up
    px(frame, 46+ox, 36+oy, ...DARK);
    px(frame, 47+ox, 34+oy, ...BODY);
    px(frame, 47+ox, 32+oy, ...BODY);
    px(frame, 48+ox, 30+oy, ...BODY);
    px(frame, 48+ox, 28+oy, ...DARK);
  } else {
    // Normal tail - curved right
    px(frame, 46+ox+tw, 38+oy, ...DARK);
    px(frame, 47+ox+tw, 37+oy, ...BODY);
    px(frame, 48+ox+tw, 36+oy, ...BODY);
    px(frame, 49+ox+tw, 35+oy, ...BODY);
    px(frame, 50+ox+tw, 34+oy, ...BODY);
    px(frame, 51+ox+tw, 34+oy, ...DARK);
    px(frame, 51+ox+tw, 33+oy, ...BODY);
  }

  // Body
  ellipse(frame, 32+ox, 42+oy, 13, 10, ...BODY);
  // Belly
  ellipse(frame, 32+ox, 44+oy, 8, 6, ...BELLY);

  // Head
  ellipse(frame, 32+ox, 27+oy, 11, 9, ...BODY);

  // Ears
  if (earsBack) {
    // Ears flattened (sideways)
    rect(frame, 21+ox, 20+oy, 3, 2, ...DARK);
    rect(frame, 22+ox, 20+oy, 2, 1, ...EAR_IN);
    rect(frame, 40+ox, 20+oy, 3, 2, ...DARK);
    rect(frame, 41+ox, 20+oy, 2, 1, ...EAR_IN);
  } else {
    // Left ear (triangle pointing up)
    px(frame, 22+ox, 20+oy, ...DARK);
    px(frame, 23+ox, 19+oy, ...DARK);
    px(frame, 24+ox, 18+oy, ...DARK);
    px(frame, 25+ox, 17+oy, ...DARK);
    px(frame, 25+ox, 18+oy, ...BODY);
    px(frame, 26+ox, 19+oy, ...BODY);
    px(frame, 27+ox, 20+oy, ...DARK);
    px(frame, 24+ox, 19+oy, ...BODY);
    px(frame, 25+ox, 19+oy, ...EAR_IN);
    px(frame, 25+ox, 20+oy, ...EAR_IN);
    px(frame, 26+ox, 20+oy, ...BODY);
    // Right ear
    px(frame, 37+ox, 20+oy, ...DARK);
    px(frame, 38+ox, 19+oy, ...BODY);
    px(frame, 39+ox, 19+oy, ...EAR_IN);
    px(frame, 39+ox, 18+oy, ...BODY);
    px(frame, 40+ox, 17+oy, ...DARK);
    px(frame, 39+ox, 20+oy, ...EAR_IN);
    px(frame, 40+ox, 18+oy, ...BODY);
    px(frame, 41+ox, 19+oy, ...DARK);
    px(frame, 42+ox, 20+oy, ...DARK);
  }

  // Eyes
  if (xeyes) {
    // X eyes (hurt/dizzy)
    px(frame, 28+ox, 25+oy, ...EYE);
    px(frame, 30+ox, 25+oy, ...EYE);
    px(frame, 29+ox, 26+oy, ...EYE);
    px(frame, 28+ox, 27+oy, ...EYE);
    px(frame, 30+ox, 27+oy, ...EYE);

    px(frame, 35+ox, 25+oy, ...EYE);
    px(frame, 37+ox, 25+oy, ...EYE);
    px(frame, 36+ox, 26+oy, ...EYE);
    px(frame, 35+ox, 27+oy, ...EYE);
    px(frame, 37+ox, 27+oy, ...EYE);
  } else if (closedEyes) {
    // Closed eyes: horizontal lines (^_^)
    rect(frame, 27+ox, 26+oy, 3, 1, ...DARK);
    rect(frame, 34+ox, 26+oy, 3, 1, ...DARK);
  } else if (bigEyes) {
    // Big panicked eyes
    ellipse(frame, 29+ox, 26+oy, 3, 3, ...EYE);
    ellipse(frame, 36+ox, 26+oy, 3, 3, ...EYE);
    px(frame, 28+ox, 25+oy, ...WHITE);
    px(frame, 35+ox, 25+oy, ...WHITE);
  } else {
    // Normal eyes
    ellipse(frame, 29+ox, 26+oy, 2, 2, ...EYE);
    ellipse(frame, 36+ox, 26+oy, 2, 2, ...EYE);
    px(frame, 28+ox, 25+oy, ...WHITE);
    px(frame, 35+ox, 25+oy, ...WHITE);
  }

  // Nose
  px(frame, 31+ox, 29+oy, ...NOSE);
  px(frame, 32+ox, 29+oy, ...NOSE);
  px(frame, 32+ox, 30+oy, ...NOSE);

  // Mouth
  if (happyMouth) {
    // Happy cat mouth: D shape
    px(frame, 30+ox, 31+oy, ...DARK);
    px(frame, 31+ox, 32+oy, ...DARK);
    px(frame, 32+ox, 33+oy, ...DARK);
    px(frame, 33+ox, 32+oy, ...DARK);
    px(frame, 34+ox, 31+oy, ...DARK);
  } else if (openMouth) {
    // Open mouth: O shape
    ellipse(frame, 32+ox, 32+oy, 2, 2, ...DARK);
    ellipse(frame, 32+ox, 32+oy, 1, 1, ...NOSE);
  } else {
    // Normal mouth
    px(frame, 31+ox, 31+oy, ...DARK);
    px(frame, 33+ox, 31+oy, ...DARK);
  }

  // Whiskers
  for (let i = 0; i < 3; i++) {
    px(frame, 19+i+ox, 28+oy, ...DARK);
    px(frame, 19+i+ox, 30-i+oy, ...DARK);
    px(frame, 42-i+ox, 28+oy, ...DARK);
    px(frame, 42-i+ox, 30-i+oy, ...DARK);
  }

  // Paws
  if (raisedPaws) {
    // Raised paws - arms up
    rect(frame, 19+ox, 33+oy, 4, 4, ...BODY);
    rect(frame, 20+ox, 32+oy, 2, 1, ...BELLY); // paw pad
    rect(frame, 41+ox, 33+oy, 4, 4, ...BODY);
    rect(frame, 42+ox, 32+oy, 2, 1, ...BELLY);
  } else {
    // Normal paws - sitting
    rect(frame, 23+ox, 50+oy, 5, 3, ...BODY);
    rect(frame, 36+ox, 50+oy, 5, 3, ...BODY);
    rect(frame, 24+ox, 52+oy, 3, 1, ...BELLY);
    rect(frame, 37+ox, 52+oy, 3, 1, ...BELLY);
  }
}

// ==================== IDLE: 4 frames ====================
// Cat sitting idle: breathing + blink cycle
function generateIdle() {
  const frames = [];

  // Frame 0: Normal sitting, eyes open
  let f = createFrame();
  drawCat(f);
  frames.push(f);

  // Frame 1: Body slightly up (breathing in), tail wiggle
  f = createFrame();
  drawCat(f, 0, -2, { tailWag: 1 });
  frames.push(f);

  // Frame 2: Eyes closed (blink)
  f = createFrame();
  drawCat(f, 0, -2, { closedEyes: true });
  frames.push(f);

  // Frame 3: Body back to normal, tail other side
  f = createFrame();
  drawCat(f, 0, 0, { tailWag: -1 });
  frames.push(f);

  return frames;
}

// ==================== WORKING: 6 frames ====================
// Cat typing on laptop - paws alternate, head bobs, code scrolls
function generateWorking() {
  const frames = [];

  for (let i = 0; i < 6; i++) {
    const f = createFrame();
    const headBob = [0, -1, -2, -1, 0, 1][i];
    const leftPawUp = (i % 2 === 0);
    const rightPawUp = (i % 2 === 1);

    // Draw the cat first (shifted down to make room for laptop)
    drawCat(f, 0, headBob - 2);

    // Laptop base
    rect(f, 14, 46, 36, 5, 70, 70, 80);
    rect(f, 14, 45, 36, 1, 90, 90, 100);
    // Keyboard keys (animated)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 8; col++) {
        const keyX = 16 + col * 4;
        const keyY = 47 + row * 2;
        const bright = ((col + row + i) % 3 === 0) ? 120 : 90;
        rect(f, keyX, keyY, 3, 1, bright, bright, bright + 20);
      }
    }

    // Screen
    rect(f, 20, 30, 24, 15, 50, 50, 60);
    rect(f, 21, 31, 22, 13, 20, 20, 40);

    // Code lines on screen (scrolling effect)
    const lineColors = [CODE, [100, 180, 255], [255, 180, 100], CODE];
    for (let line = 0; line < 4; line++) {
      const lineLen = 4 + ((i + line) % 6);
      const cIdx = (i + line) % lineColors.length;
      const c = lineColors[cIdx];
      for (let col = 0; col < lineLen && col < 18; col++) {
        px(f, 23 + col, 33 + line * 3, c[0], c[1], c[2], 180);
      }
    }

    // Animated paws on keyboard
    // Clear normal paw area
    clearRect(f, 23, 48, 18, 6);

    const lpY = leftPawUp ? 44 : 46;
    const rpY = rightPawUp ? 44 : 46;
    rect(f, 22, lpY, 5, 3, ...BODY);
    rect(f, 23, lpY + 1, 3, 1, ...BELLY);
    rect(f, 37, rpY, 5, 3, ...BODY);
    rect(f, 38, rpY + 1, 3, 1, ...BELLY);

    frames.push(f);
  }

  return frames;
}

// ==================== WAITING: 6 frames ====================
// Cat looking left/right impatiently, tapping paw, sweat drop
function generateWaiting() {
  const frames = [];

  for (let i = 0; i < 6; i++) {
    const f = createFrame();
    // Head direction: look left, center, right, right, center, left
    const headDir = [-4, -2, 0, 2, 4, 2][i];
    const bobY = [0, -1, 0, -1, 0, -1][i];
    const tw = [0, 1, 2, 2, 1, 0][i];

    drawCat(f, headDir, bobY, {
      tailWag: tw,
      openMouth: (i === 0 || i === 3),
    });

    // Tapping paw (right paw alternates up/down)
    if (i % 2 === 0) {
      clearRect(f, 36, 50, 5, 3);
      rect(f, 37, 48, 5, 3, ...BODY);
      rect(f, 38, 49, 3, 1, ...BELLY);
    }

    // Sweat drop (appears/disappears)
    if (i === 1 || i === 4) {
      px(f, 42 + headDir, 17 + bobY, ...SWEAT);
      px(f, 43 + headDir, 16 + bobY, ...SWEAT);
      px(f, 43 + headDir, 15 + bobY, ...SWEAT);
      px(f, 44 + headDir, 14 + bobY, ...SWEAT);
    }

    // Question marks floating
    if (i === 0 || i === 3) {
      px(f, 22 + headDir, 13 + bobY, ...YELLOW);
      px(f, 23 + headDir, 13 + bobY, ...YELLOW);
      px(f, 24 + headDir, 13 + bobY, ...YELLOW);
      px(f, 23 + headDir, 14 + bobY, ...YELLOW);
      px(f, 23 + headDir, 16 + bobY, ...YELLOW);
    }

    frames.push(f);
  }

  return frames;
}

// ==================== ERROR: 4 frames ====================
// Cat panicking: shaking body, big eyes, exclamation marks, zigzag tail
function generateError() {
  const frames = [];

  for (let i = 0; i < 4; i++) {
    const f = createFrame();
    // Big shake alternating
    const shakeX = (i % 2 === 0) ? -3 : 3;
    const shakeY = (i % 2 === 0) ? 0 : -2;

    drawCat(f, shakeX, shakeY, {
      bigEyes: true,
      openMouth: true,
      earsBack: true,
      tailUp: true,
    });

    // Fur spikes on top (panic lines)
    for (let s = 0; s < 3; s++) {
      const sx = 26 + s * 6 + shakeX;
      px(f, sx, 14 + shakeY, ...RED);
      px(f, sx, 13 + shakeY, ...RED);
      px(f, sx, 12 + shakeY, ...RED);
    }

    // Exclamation mark (bouncing)
    const exY = (i % 2 === 0) ? 3 : 5;
    const exX = 32 + shakeX;
    // Dot
    px(f, exX, exY + 6 + shakeY, ...RED);
    // Line
    px(f, exX, exY + shakeY, ...RED);
    px(f, exX, exY + 1 + shakeY, ...RED);
    px(f, exX, exY + 2 + shakeY, ...RED);
    px(f, exX - 1, exY + 3 + shakeY, ...RED);
    px(f, exX, exY + 3 + shakeY, ...RED);
    px(f, exX + 1, exY + 3 + shakeY, ...RED);

    // Zigzag panic lines on sides
    for (let j = 0; j < 3; j++) {
      const ly = 22 + j * 6 + shakeY;
      px(f, 12 + shakeX, ly, ...YELLOW);
      px(f, 13 + shakeX, ly + 1, ...YELLOW);
      px(f, 14 + shakeX, ly, ...YELLOW);
      px(f, 50 + shakeX, ly, ...YELLOW);
      px(f, 51 + shakeX, ly + 1, ...YELLOW);
      px(f, 52 + shakeX, ly, ...YELLOW);
    }

    frames.push(f);
  }

  return frames;
}

// ==================== COMPLETED: 6 frames ====================
// Cat jumping with joy, paws raised, stars, happy face
function generateCompleted() {
  const frames = [];

  for (let i = 0; i < 6; i++) {
    const f = createFrame();
    // Big jump arc
    const jumpY = [0, -4, -8, -12, -8, -3][i];
    const isAirborne = jumpY < -3;

    drawCat(f, 0, jumpY, {
      raisedPaws: isAirborne,
      happyMouth: isAirborne,
      closedEyes: isAirborne,
      tailUp: isAirborne,
    });

    // Stars (animated, spinning around)
    const starFrames = [
      [[8, 10], [54, 8], [6, 35], [56, 40]],
      [[10, 7], [52, 11], [8, 38], [54, 37]],
      [[12, 5], [50, 6], [10, 40], [52, 42]],
      [[14, 6], [48, 5], [8, 38], [54, 37]],
      [[12, 8], [50, 9], [6, 35], [56, 40]],
      [[10, 10], [52, 7], [8, 33], [54, 42]],
    ];

    for (const [sx, sy] of starFrames[i]) {
      drawStarShape(f, sx, sy, ...STAR_C);
    }

    // Sparkle particles
    if (i % 2 === 0) {
      for (let p = 0; p < 4; p++) {
        const spX = 15 + p * 12;
        const spY = 15 + (i * 3 + p * 5) % 30 + jumpY;
        px(f, spX, spY, ...STAR_C);
        px(f, spX + 1, spY, ...STAR_C);
        px(f, spX, spY + 1, ...STAR_C);
      }
    }

    // Ground shadow when airborne
    if (isAirborne) {
      const shadowAlpha = Math.max(30, 60 + jumpY * 3);
      ellipse(f, 32, 54, 10, 2, 0, 0, 0, shadowAlpha);
    }

    frames.push(f);
  }

  return frames;
}

// ==================== HURT: 6 frames ====================
// Cat being whipped: X eyes, crying, shaking, pain stars, bump on head
function generateHurt() {
  const frames = [];
  const TEAR = [100, 180, 255];
  const PAIN = [255, 60, 50];
  const BUMP = [255, 170, 170];

  for (let i = 0; i < 6; i++) {
    const f = createFrame();

    // Body bounces: squish down, recoil up, squish, recoil
    const bodyY = [4, -2, 3, -1, 2, 0][i];
    const shakeX = [0, -3, 3, -2, 2, 0][i];

    drawCat(f, shakeX, bodyY, {
      xeyes: true,
      openMouth: true,
      earsBack: true,
      tailUp: true,
    });

    // Make the mouth bigger for "OUCH!" scream
    clearRect(f, 30+shakeX, 30+bodyY, 5, 5);
    ellipse(f, 32+shakeX, 33+bodyY, 2, 3, ...EYE);
    px(f, 32+shakeX, 31+bodyY, ...NOSE);

    // Tears flying out from eyes
    const tearDir = (i % 2 === 0) ? 1 : -1;
    px(f, 25+shakeX, 24+bodyY, ...TEAR);
    px(f, 24+shakeX+tearDir, 26+bodyY, ...TEAR);
    px(f, 38+shakeX, 24+bodyY, ...TEAR);
    px(f, 39+shakeX-tearDir, 26+bodyY, ...TEAR);

    // Pain stars circling above head
    const starPos = [
      [[24, 11], [40, 13]],
      [[26, 9], [38, 11]],
      [[28, 8], [36, 8]],
      [[30, 8], [34, 9]],
      [[28, 10], [36, 10]],
      [[26, 11], [38, 12]],
    ];
    for (const [sx, sy] of starPos[i]) {
      px(f, sx+shakeX, sy+bodyY, 255, 220, 50);
      px(f, sx+1+shakeX, sy+bodyY, 255, 220, 50);
      px(f, sx+shakeX, sy+1+bodyY, 255, 220, 50);
      px(f, sx+1+shakeX, sy+1+bodyY, 255, 220, 50);
    }

    // Impact mark on top of head (first 2 frames - fresh whip hit)
    if (i < 2) {
      px(f, 30+shakeX, 15+bodyY, ...PAIN);
      px(f, 31+shakeX, 14+bodyY, ...PAIN);
      px(f, 32+shakeX, 13+bodyY, ...PAIN);
      px(f, 33+shakeX, 14+bodyY, ...PAIN);
      px(f, 34+shakeX, 15+bodyY, ...PAIN);
      px(f, 31+shakeX, 16+bodyY, ...PAIN);
      px(f, 33+shakeX, 16+bodyY, ...PAIN);
    }

    // Bump on head (grows from frame 2 onwards)
    if (i >= 2) {
      const bumpH = i - 1;
      for (let b = 0; b <= bumpH; b++) {
        px(f, 32+shakeX, 16-b+bodyY, ...BUMP);
        if (b > 0) {
          px(f, 31+shakeX, 16-b+bodyY, ...BUMP);
          px(f, 33+shakeX, 16-b+bodyY, ...BUMP);
        }
      }
    }

    frames.push(f);
  }

  return frames;
}

function drawStarShape(frame, cx, cy, r, g, b) {
  // Diamond star shape
  px(frame, cx, cy - 2, r, g, b);
  px(frame, cx - 1, cy - 1, r, g, b);
  px(frame, cx, cy - 1, r, g, b);
  px(frame, cx + 1, cy - 1, r, g, b);
  px(frame, cx - 2, cy, r, g, b);
  px(frame, cx - 1, cy, r, g, b);
  px(frame, cx, cy, r, g, b);
  px(frame, cx + 1, cy, r, g, b);
  px(frame, cx + 2, cy, r, g, b);
  px(frame, cx - 1, cy + 1, r, g, b);
  px(frame, cx, cy + 1, r, g, b);
  px(frame, cx + 1, cy + 1, r, g, b);
  px(frame, cx, cy + 2, r, g, b);
}

// Generate all
const spriteDir = 'public/pet';
const sheets = [
  { name: 'idle', gen: generateIdle },
  { name: 'working', gen: generateWorking },
  { name: 'waiting', gen: generateWaiting },
  { name: 'error', gen: generateError },
  { name: 'completed', gen: generateCompleted },
  { name: 'hurt', gen: generateHurt },
];

for (const { name, gen } of sheets) {
  const frames = gen();
  const png = createSpriteSheet(frames);
  const path = `${spriteDir}/${name}.png`;
  fs.writeFileSync(path, png);
  console.log(`Generated ${path}: ${frames.length} frames, ${png.length} bytes`);
}
