'use strict';
// UserInputService, ContextActionService, ProximityPrompt / ClickDetector interaction, Mouse.
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, tostr, E, CO, SCHED, Coroutine } = C;
const { nat } = require('../lua2js/runtime');
const D = require('./datatypes');
const I = require('./instance');
const S = require('./services');
const P = require('./players');
const physics = require('./physics');
const { ENV, Instance, CLASSES, newInstance, noteUnsupported, Signal } = I;
const { Vector3, Vector2, v3 } = D;
const En = (t, n) => D.EnumLib.lget(t).lget(n);

class InputObject extends Userdata {
  constructor(type, state, key, pos, delta) { super(); this.type = type; this.state = state; this.key = key; this.pos = pos || v3(0, 0, 0); this.delta = delta || v3(0, 0, 0); }
  get tname() { return 'InputObject'; }
  lget(k) {
    switch (k) {
      case 'KeyCode': return this.key; case 'UserInputType': return this.type; case 'UserInputState': return this.state;
      case 'Position': return this.pos; case 'Delta': return this.delta;
      case 'IsModifierKeyDown': return nat((s, kc) => !!(ENV.input && ENV.input.keys.has(kc.name)), 'IsModifierKeyDown');
    }
    throw rtError(`${tostr(k)} is not a valid member of InputObject`);
  }
}
ENV.InputObject = InputObject;

const KEYMAP = { Space: 'Space', Enter: 'Return', NumpadEnter: 'KeypadEnter', Escape: 'Escape', Tab: 'Tab', Backspace: 'Backspace', ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', ControlRight: 'RightControl', AltLeft: 'LeftAlt', AltRight: 'RightAlt', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: 'Backquote', Minus: 'Minus', Equal: 'Equals', BracketLeft: 'LeftBracket', BracketRight: 'RightBracket', Semicolon: 'Semicolon', Quote: 'Quote', Comma: 'Comma', Period: 'Period', Slash: 'Slash', Backslash: 'BackSlash', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'CapsLock' };
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
function keyName(code) {
  if (KEYMAP[code]) return KEYMAP[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit(\d)$/.exec(code); if (m) return DIGITS[+m[1]];
  m = /^Numpad(\d)$/.exec(code); if (m) return 'Keypad' + DIGITS[+m[1]];
  m = /^F(\d+)$/.exec(code); if (m) return 'F' + m[1];
  return null;
}

const input = ENV.input = {
  keys: new Set(), mouseButtons: new Set(), mousePos: new Vector2(0, 0), mouseDelta: new Vector2(0, 0),
  joy: [0, 0], jump: false, lastType: 'Keyboard', touchEnabled: false, focusedTextBox: null,
  actions: [],
  keyCode(name) { return En('KeyCode', name); },
  moveVector() {
    let f = 0, r = 0;
    const k = input.keys;
    if (!input.blockMove) {
      if (k.has('W') || k.has('Up')) f += 1; if (k.has('S') || k.has('Down')) f -= 1;
      if (k.has('D') || k.has('Right')) r += 1; if (k.has('A') || k.has('Left')) r -= 1;
    }
    f += -input.joy[1]; r += input.joy[0];
    if (!f && !r) return [0, 0];
    const yaw = ENV.cam ? ENV.cam.yaw : 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let x = fx * f + rx * r, z = fz * f + rz * r;
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    return [x, z];
  },
  jumping() { return !input.blockMove && input.keys.has('Space') || input.jump; },
  mouse(player) {
    if (!ENV.mouse) { ENV.mouse = new Instance(CLASSES.get('PlayerMouse')); ENV.mouse.props.Name = 'Mouse'; }
    return ENV.mouse;
  },
  // dispatch a raw input event. gpe = game processed event (a GUI consumed it)
  fire(kind, keyName, state, pos, gpe, delta) {
    const uis = ENV.svc('UserInputService');
    const typeName = kind;
    const obj = new InputObject(En('UserInputType', typeName), En('UserInputState', state), En('KeyCode', keyName || 'Unknown'), pos, delta);
    if (state === 'Begin') uis.fireSignal('InputBegan', obj, !!gpe);
    else if (state === 'End') uis.fireSignal('InputEnded', obj, !!gpe);
    else uis.fireSignal('InputChanged', obj, !!gpe);
    // context actions
    if (!gpe) input.runActions(obj, typeName, keyName, state);
    return obj;
  },
  runActions(obj, typeName, keyName, state) {
    for (let i = input.actions.length - 1; i >= 0; i--) {
      const a = input.actions[i];
      if (!a.inputs.some((x) => x === keyName || x === typeName)) continue;
      const co = new Coroutine(function* () {
        const r = yield* C.toCallable(a.fn)(a.name, obj.state, obj);
        return r;
      }, ENV.contexts.client);
      const r = ENV.rt.resumeThread(co, []);
      if (r[0] && r[1] && r[1].name === 'Sink') break;
    }
  },
  key(code, down, gpe) {
    const name = typeof code === 'string' && keyName(code) || code; if (!name) return;
    const had = input.keys.has(name);
    if (down === had) return;
    if (down) input.keys.add(name); else input.keys.delete(name);
    input.lastType = 'Keyboard';
    input.fire('Keyboard', name, down ? 'Begin' : 'End', v3(0, 0, 0), gpe || !!input.focusedTextBox);
    if (down && name === 'Space' && !gpe) ENV.svc('UserInputService').fireSignal('JumpRequest');
    // prompts
    if (!gpe && !input.focusedTextBox) {
      if (down) ENV.prompts.keyDown(name); else ENV.prompts.keyUp(name);
    }
  },
  mouseButton(btn, down, x, y, gpe) {
    const nm = btn === 0 ? 'MouseButton1' : btn === 2 ? 'MouseButton2' : 'MouseButton3';
    input.mousePos = new Vector2(x, y);
    if (down) input.mouseButtons.add(nm); else input.mouseButtons.delete(nm);
    input.lastType = 'MouseButton';
    input.fire(nm, 'Unknown', down ? 'Begin' : 'End', v3(x, y, 0), gpe);
    const m = ENV.mouse;
    if (m && !gpe) m.fireSignal(btn === 2 ? (down ? 'Button2Down' : 'Button2Up') : (down ? 'Button1Down' : 'Button1Up'));
    if (!gpe && btn === 0 && !down) ENV.clicks.click(x, y);
    if (btn === 0) input.tool(down && !gpe);
  },
  // Tool.Activated / Deactivated: a click or tap in the world (not on GUI) while a Tool is equipped
  tool(down) {
    const ch = ENV.localPlayer && ENV.localPlayer.props.Character; if (!ch) return;
    let t = null; for (const c of ch.children) if (c.className === 'Tool') { t = c; break; }
    if (!t) return;
    if (down) {
      const hum = ch.children.find((c) => c.className === 'Humanoid');
      if (!hum || hum.props.Health <= 0 || !t.props.Enabled || t.props.ManualActivationOnly || t.toolDown) return;
      t.toolDown = true; t.fireSignal('Activated');
    } else if (t.toolDown) { t.toolDown = false; t.fireSignal('Deactivated'); }
  },
  mouseMove(x, y, dx, dy, gpe) {
    input.mousePos = new Vector2(x, y); input.mouseDelta = new Vector2(dx, dy);
    input.fire('MouseMovement', 'Unknown', 'Change', v3(x, y, 0), gpe, v3(dx, dy, 0));
    if (ENV.mouse) ENV.mouse.fireSignal('Move');
    ENV.clicks.hover(x, y);
  },
  wheel(dy, gpe) { input.fire('MouseWheel', 'Unknown', 'Change', v3(0, dy, 0), gpe, v3(0, dy, 0)); if (ENV.mouse) ENV.mouse.fireSignal(dy > 0 ? 'WheelForward' : 'WheelBackward'); },
  touch(state, x, y, gpe) {
    input.lastType = 'Touch';
    input.fire('Touch', 'Unknown', state, v3(x, y, 0), gpe);
    const uis = ENV.svc('UserInputService');
    if (state === 'Begin') input.tool(!gpe); else if (state === 'End') input.tool(false);
    if (state === 'End' && !gpe) { uis.fireSignal('TouchTap', tbl1(new Vector2(x, y)), false); uis.fireSignal('TouchTapInWorld', new Vector2(x, y), false); ENV.clicks.click(x, y); }
  },
};
const tbl1 = (v) => new LuaTable([v]);

const extend = P.extend;
CLASSES.get('UserInputService').props.set('MouseEnabled', { def: true });
extend('UserInputService', {
  props: { KeyboardEnabled: true, TouchEnabled: P.extend && false, MouseBehavior: En('MouseBehavior', 'Default'), MouseIconEnabled: true, MouseDeltaSensitivity: 1, GamepadEnabled: false, AccelerometerEnabled: false, GyroscopeEnabled: false, VREnabled: false, ModalEnabled: false, OnScreenKeyboardVisible: false, MouseEnabled: true,
    TouchEnabled2: false },
  events: ['InputBegan', 'InputEnded', 'InputChanged', 'TouchTap', 'TouchTapInWorld', 'TouchStarted', 'TouchEnded', 'TouchMoved', 'TouchLongPress', 'TouchPan', 'TouchPinch', 'TouchRotate', 'TouchSwipe', 'JumpRequest', 'TextBoxFocused', 'TextBoxFocusReleased', 'LastInputTypeChanged', 'WindowFocused', 'WindowFocusReleased', 'PointerAction', 'DeviceAccelerationChanged', 'DeviceGravityChanged', 'DeviceRotationChanged', 'GamepadConnected', 'GamepadDisconnected', 'StatusBarTapped', 'UserCFrameChanged'],
  methods: {
    GetMouseLocation() { return input.mousePos; },
    GetMouseDelta() { return input.mouseDelta; },
    IsKeyDown(self, kc) { return input.keys.has(kc.name); },
    IsMouseButtonPressed(self, t) { return input.mouseButtons.has(t.name); },
    GetKeysPressed() { return new LuaTable(Array.from(input.keys).map((k) => { const o = new InputObject(En('UserInputType', 'Keyboard'), En('UserInputState', 'Begin'), En('KeyCode', k)); return o; })); },
    GetConnectedGamepads() { return new LuaTable(); },
    IsGamepadButtonDown() { return false; }, GetGamepadState() { return new LuaTable(); }, GetNavigationGamepads() { return new LuaTable(); },
    GetFocusedTextBox() { return input.focusedTextBox || undefined; },
    GetLastInputType() { return En('UserInputType', input.lastType); },
    GetStringForKeyCode(self, kc) { return kc.name; },
    GetDeviceAcceleration() { return new InputObject(En('UserInputType', 'Accelerometer'), En('UserInputState', 'None'), En('KeyCode', 'Unknown')); },
    GetPlatform() { return En('Platform', 'Windows'); },
    GetImageForKeyCode() { return ''; },
    SetNavigationGamepad() { return E; },
  },
});
CLASSES.get('UserInputService').props.set('TouchEnabled', { $p: true, def: false, get: () => !!input.touchEnabled, ro: true });
CLASSES.get('UserInputService').props.delete('TouchEnabled2');
CLASSES.get('UserInputService')._pc.clear();
for (const ev of ['PromptTriggered', 'PromptTriggerEnded', 'PromptButtonHoldBegan', 'PromptButtonHoldEnded', 'PromptShown', 'PromptHidden']) CLASSES.get('ProximityPromptService').events.add(ev);
CLASSES.get('ProximityPromptService').props.set('Enabled', { def: true });
CLASSES.get('ProximityPromptService')._ec.clear();

/* ContextActionService */
extend('ContextActionService', { methods: {
  BindAction(self, name, fn, touchBtn, ...keys) {
    input.actions = input.actions.filter((a) => a.name !== name);
    const inputs = []; for (const k of keys) { if (k && k.name) inputs.push(k.name); }
    input.actions.push({ name, fn, inputs });
    if (touchBtn && ENV.gui && ENV.gui.addActionButton) ENV.gui.addActionButton(name);
    return E;
  },
  BindActionAtPriority(self, name, fn, touchBtn, prio, ...keys) { input.actions = input.actions.filter((a) => a.name !== name); const inputs = []; for (const k of keys) if (k && k.name) inputs.push(k.name); input.actions.push({ name, fn, inputs }); return E; },
  UnbindAction(self, name) { input.actions = input.actions.filter((a) => a.name !== name); return E; },
  UnbindAllActions() { input.actions = []; return E; },
  GetAllBoundActionInfo() { return new LuaTable(); },
  SetTitle() { return E; }, SetPosition() { return E; }, SetImage() { return E; }, SetDescription() { return E; },
  GetButton() { return undefined; },
} });
CLASSES.get('ContextActionService').events.add('LocalToolEquipped'); CLASSES.get('ContextActionService').events.add('LocalToolUnequipped'); CLASSES.get('ContextActionService')._ec.clear();

/* ------------------------------------------------ ProximityPrompts */
const prompts = ENV.prompts = { list: new Set(), active: null, hold: null, holdT: 0 };
ENV.listeners.attach.push((i) => { if (i.className === 'ProximityPrompt') prompts.list.add(i); });
ENV.listeners.detach.push((i) => { if (i.className === 'ProximityPrompt') { prompts.list.delete(i); if (prompts.active === i) prompts.setActive(null); } });
function promptPos(pr) {
  const p = pr.parent; if (!p) return null;
  if (p.isA('BasePart')) { const c = p.props.CFrame; return [c.x, c.y, c.z]; }
  if (p.className === 'Attachment') { const w = p.lget('WorldPosition'); return [w.x, w.y, w.z]; }
  if (p.isA('Model')) { const c = I.modelPivot(p); return [c.x, c.y, c.z]; }
  return null;
}
prompts.setActive = function (pr) {
  const old = prompts.active; if (old === pr) return;
  if (prompts.hold) prompts.release();
  prompts.active = pr;
  const pps = ENV.svc('ProximityPromptService');
  const pl = ENV.localPlayer;
  if (old && !old.destroyed) { old.fireSignal('PromptHidden'); pps.fireSignal('PromptHidden', old, ENV.contexts.client ? undefined : undefined); }
  if (pr) { pr.fireSignal('PromptShown'); pps.fireSignal('PromptShown', pr); }
};
prompts.update = function (dt) {
  const pl = ENV.localPlayer; const ch = pl && pl.props.Character; const hrp = ch && ch.findChild('HumanoidRootPart');
  const hum = ch && ch.findChild('Humanoid');
  if (!hrp || !hum || hum.props.Health <= 0 || !ENV.svc('ProximityPromptService').props.Enabled) return prompts.setActive(null);
  const c = hrp.props.CFrame; let best = null, bd = Infinity;
  for (const pr of prompts.list) {
    if (!pr.props.Enabled) continue;
    const pos = promptPos(pr); if (!pos) continue;
    const d = Math.hypot(pos[0] - c.x, pos[1] - c.y, pos[2] - c.z);
    if (d > pr.props.MaxActivationDistance || d >= bd) continue;
    if (pr.props.RequiresLineOfSight) {
      const dir = [pos[0] - c.x, pos[1] - c.y, pos[2] - c.z]; const l = d || 1;
      const hit = physics.world.rayRaw([c.x, c.y, c.z], [dir[0] / l, dir[1] / l, dir[2] / l], Math.max(0, l - 0.5), (i) => (i.charPart || i.parent === ch || !i.props.CanCollide || (pr.parent && (i === pr.parent || (pr.parent.isA('Model') && pr.parent.isAncestorOf(i)) || (pr.parent.parent && pr.parent.parent.isA('Model') && pr.parent.parent.isAncestorOf(i))))));
      if (hit) continue;
    }
    best = pr; bd = d;
  }
  prompts.setActive(best);
  if (prompts.hold) {
    prompts.holdT += dt;
    const need = prompts.hold.props.HoldDuration;
    if (prompts.holdT >= need) { const pr = prompts.hold; prompts.hold = null; prompts.trigger(pr); }
  }
};
prompts.trigger = function (pr) {
  const pl = ENV.localPlayer; if (!pl) return;
  pr.fireSignal('Triggered', pl);
  ENV.svc('ProximityPromptService').fireSignal('PromptTriggered', pr, pl);
  prompts.lastTriggered = pr;
  setTimeoutEnd(pr);
};
function setTimeoutEnd(pr) { /* TriggerEnded is fired on release */ }
prompts.press = function (pr) {
  if (!pr || prompts.hold) return;
  const pl = ENV.localPlayer;
  if (pr.props.HoldDuration > 0) { prompts.hold = pr; prompts.holdT = 0; pr.fireSignal('PromptButtonHoldBegan', pl); ENV.svc('ProximityPromptService').fireSignal('PromptButtonHoldBegan', pr, pl); }
  else { prompts.trigger(pr); prompts.pressed = pr; }
};
prompts.release = function () {
  const pl = ENV.localPlayer;
  if (prompts.hold) { const pr = prompts.hold; prompts.hold = null; pr.fireSignal('PromptButtonHoldEnded', pl); ENV.svc('ProximityPromptService').fireSignal('PromptButtonHoldEnded', pr, pl); }
  if (prompts.pressed || prompts.lastTriggered) { const pr = prompts.pressed || prompts.lastTriggered; prompts.pressed = null; prompts.lastTriggered = null; if (!pr.destroyed) { pr.fireSignal('TriggerEnded', pl); ENV.svc('ProximityPromptService').fireSignal('PromptTriggerEnded', pr, pl); } }
};
prompts.keyDown = function (name) { const a = prompts.active; if (a && a.props.KeyboardKeyCode.name === name) prompts.press(a); };
prompts.keyUp = function (name) { const a = prompts.active; if ((a && a.props.KeyboardKeyCode.name === name) || prompts.hold || prompts.pressed || prompts.lastTriggered) { if (prompts.hold && prompts.hold.props.KeyboardKeyCode.name !== name) return; prompts.release(); } };

/* ------------------------------------------------ ClickDetectors and Mouse.Target */
const clicks = ENV.clicks = {
  hovered: null,
  rayAt(x, y) {
    if (!ENV.screenRay) return null;
    const ray = ENV.screenRay(x, y); const o = ray.o, d = ray.d;
    const ch = ENV.localPlayer && ENV.localPlayer.props.Character;
    const r = physics.world.rayRaw([o.x, o.y, o.z], [d.x, d.y, d.z], 1000, (i) => !!(ch && ch.isAncestorOf(i)) || i.props.Transparency >= 1 && !i.findFirstClickDetector);
    if (!r) return null;
    return { inst: r.inst, pos: v3(o.x + d.x * r.t, o.y + d.y * r.t, o.z + d.z * r.t), t: r.t, n: r.n };
  },
  detectorFor(part) {
    for (let p = part; p && p !== ENV.workspace; p = p.parent) {
      for (const ch of p.children) if (ch.className === 'ClickDetector') return ch;
    }
    return null;
  },
  inRange(cd) {
    const ch = ENV.localPlayer && ENV.localPlayer.props.Character; const hrp = ch && ch.findChild('HumanoidRootPart'); if (!hrp) return false;
    const pp = cd.parent && (cd.parent.isA('BasePart') ? cd.parent : cd.parent.isA('Model') ? cd.parent.props.PrimaryPart || cd.parent.descendants().find((d) => d.isA('BasePart')) : null);
    if (!pp) return true;
    const a = hrp.props.CFrame, b = pp.props.CFrame;
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= cd.props.MaxActivationDistance + Math.max(pp.props.Size.x, pp.props.Size.z) / 2;
  },
  click(x, y) {
    const hit = clicks.rayAt(x, y); if (!hit) return;
    const cd = clicks.detectorFor(hit.inst);
    if (cd && clicks.inRange(cd)) cd.fireSignal('MouseClick', ENV.localPlayer);
  },
  hover(x, y) {
    const hit = clicks.rayAt(x, y);
    const cd = hit ? clicks.detectorFor(hit.inst) : null;
    const m = ENV.mouse;
    if (m && hit) { m.props.Target = hit.inst; m.props.Hit = new D.CFrame(hit.pos.x, hit.pos.y, hit.pos.z); } else if (m) { m.props.Target = undefined; }
    if (m) { m.props.X = x; m.props.Y = y; }
    const now = cd && clicks.inRange(cd) ? cd : null;
    if (now !== clicks.hovered) {
      if (clicks.hovered && !clicks.hovered.destroyed) clicks.hovered.fireSignal('MouseHoverLeave', ENV.localPlayer);
      if (now) now.fireSignal('MouseHoverEnter', ENV.localPlayer);
      clicks.hovered = now;
      if (ENV.onHoverClick) ENV.onHoverClick(!!now);
    }
  },
};
module.exports = { input, InputObject, prompts, clicks, keyName };
