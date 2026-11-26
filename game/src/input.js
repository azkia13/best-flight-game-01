// input.js — keyboard plus mouse for MERIDIAN RUN.
// One file, one job: it turns raw keydown/keyup and canvas clicks into
// named pilot inputs, and it owns the clickable menu buttons (hit-test
// rectangles the renderer registers every frame).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since the last poll
    this.clicks = [];         // {x, y} canvas-space clicks since last poll
    this.buttons = [];        // registered this frame: {x,y,w,h,action,label}
    this.mouseX = 0;
    this.mouseY = 0;
    this.onFirstGesture = null;

    window.addEventListener('keydown', (e) => {
      const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
      if (gameKeys.includes(e.key)) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressed.add(e.code);
      }
      if (this.onFirstGesture) this.onFirstGesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      const p = this.toCanvas(e);
      this.mouseX = p.x;
      this.mouseY = p.y;
    });
    canvas.addEventListener('click', (e) => {
      const p = this.toCanvas(e);
      this.clicks.push(p);
      if (this.onFirstGesture) this.onFirstGesture();
    });
  }

  // Convert a pointer event to canvas pixel coordinates (canvas is
  // 1280x800 internally but may be CSS-scaled on screen).
  toCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  isDown(code) { return this.keys.has(code); }

  // True once per physical press; the main loop clears it every frame.
  wasPressed(code) { return this.pressed.has(code); }

  // Pitch stick: ArrowUp pulls the nose up, ArrowDown pushes it down.
  pitchAxis() {
    let v = 0;
    if (this.isDown('ArrowUp')) v += 1;
    if (this.isDown('ArrowDown')) v -= 1;
    return v;
  }

  // Roll stick: ArrowLeft banks left, ArrowRight banks right.
  rollAxis() {
    let v = 0;
    if (this.isDown('ArrowRight')) v += 1;
    if (this.isDown('ArrowLeft')) v -= 1;
    return v;
  }

  // Throttle lever: W / Shift up, S / Ctrl down.
  throttleAxis() {
    let v = 0;
    if (this.isDown('KeyW') || this.isDown('ShiftLeft') || this.isDown('ShiftRight')) v += 1;
    if (this.isDown('KeyS') || this.isDown('ControlLeft') || this.isDown('ControlRight')) v -= 1;
    return v;
  }

  airbrakeHeld() { return this.isDown('Space'); }

  // The renderer registers every clickable button each frame; this runs
  // the action of the topmost button under a queued click, if any.
  registerButton(x, y, w, h, action, label) {
    this.buttons.push({ x, y, w, h, action, label });
  }

  pollClicks() {
    const hits = [];
    for (const c of this.clicks) {
      for (let i = this.buttons.length - 1; i >= 0; i--) {
        const b = this.buttons[i];
        if (c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h) {
          hits.push(b.action);
          break;
        }
      }
    }
    this.clicks.length = 0;
    this.buttons.length = 0;
    this.pressed.clear();
    return hits;
  }

  // Is the mouse hovering a button? Used to highlight menu buttons.
  hoverButton(x, y, w, h) {
    return this.mouseX >= x && this.mouseX <= x + w && this.mouseY >= y && this.mouseY <= y + h;
  }

  // Human-readable control hints shown on the How to Fly screen.
  static controlHelp() {
    return [
      ['Arrow Up / Down', 'Pitch nose up / down'],
      ['Arrow Left / Right', 'Bank and turn'],
      ['W / S or Shift / Ctrl', 'Throttle up / down'],
      ['Space', 'Airbrake'],
      ['P', 'Pause'],
      ['R', 'Restart mission'],
      ['M', 'Mute sound'],
      ['Mouse', 'Click menu buttons'],
    ];
  }
}
