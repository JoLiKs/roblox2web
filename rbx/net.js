'use strict';
// Server <-> client message passing (RemoteEvent / RemoteFunction / BindableEvent) with an async queue.
const C = require('../lua2js/core');
const { LuaTable, Userdata, rtError, E, CO, SCHED, Coroutine } = C;
const I = require('./instance');
const { ENV } = I;

const net = {
  latency: 0.04, // seconds of simulated network delay
  stats: { fireServer: 0, fireClient: 0, invokeServer: 0, invokeClient: 0 },
};
ENV.net = net;

function copyValue(v, seen, depth) {
  if (v === undefined || v === null) return undefined;
  const t = typeof v;
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (t === 'function') throw rtError('Attempted to send an unsupported value: function. Functions cannot be sent through remotes');
  if (v instanceof LuaTable) {
    if (depth > 100) throw rtError('table too deep to send through remote');
    if (seen.has(v)) return seen.get(v);
    const out = new LuaTable(); seen.set(v, out);
    for (let k = v.next(undefined); k; k = v.next(k[0])) {
      const key = k[0];
      if (typeof key !== 'number' && typeof key !== 'string') continue; // Roblox rejects other key types
      const val = copyValue(k[1], seen, depth + 1);
      if (val !== undefined) out.set(key, val);
    }
    return out;
  }
  if (v instanceof I.Instance) return v.destroyed ? undefined : v;
  if (v instanceof Userdata) {
    if (v instanceof I.Signal || v instanceof I.Connection) throw rtError('Attempted to send an unsupported value: ' + v.tname);
    return v; // Vector3, CFrame, Color3, Enum... are immutable value types
  }
  if (v instanceof Coroutine) throw rtError('Attempted to send an unsupported value: thread');
  return v;
}
function copyArgs(args) {
  const seen = new Map();
  return args.map((a) => copyValue(a, seen, 0));
}
net.copyArgs = copyArgs;

// schedule fn after latency (ordering preserved by the scheduler's sequence numbers)
function later(fn, ctx) {
  const co = new Coroutine(function* () { fn(); return E; }, ctx || null);
  ENV.rt.sleep(co, net.latency, []);
}
net.later = later;

function needCtx(want, what) {
  const cur = CO.current ? CO.current.ctx : null;
  if (cur && cur.name !== want) throw rtError(`${what} can only be called from ${want === 'server' ? 'a server Script' : 'a LocalScript'}`);
}

net.fireServer = (remote, args) => {
  needCtx('client', 'FireServer');
  net.stats.fireServer++;
  const player = ENV.localPlayer;
  const a = copyArgs(args);
  later(() => { remote.fireSignal('OnServerEvent', player, ...a); });
};
net.fireClient = (remote, player, args) => {
  needCtx('server', 'FireClient');
  if (!(player instanceof I.Instance) || !player.isA('Player')) throw rtError('FireClient: Player expected, got ' + C.tnameForErr(player));
  net.stats.fireClient++;
  const a = copyArgs(args);
  later(() => { if (player === ENV.localPlayer) remote.fireSignal('OnClientEvent', ...a); });
};
net.fireAllClients = (remote, args) => {
  needCtx('server', 'FireAllClients');
  net.stats.fireClient++;
  const a = copyArgs(args);
  later(() => { if (ENV.localPlayer) remote.fireSignal('OnClientEvent', ...a); });
};

function runHandler(handler, hargs, ctx, done) {
  const co = new Coroutine(function* () {
    try {
      const r = yield* C.toCallable(handler)(...hargs);
      done([true, ...(r instanceof Array ? r : [r])]);
    } catch (e) {
      done([false, C.errValue(e)]);
    }
    return E;
  }, ctx);
  ENV.rt.resumeThread(co, []);
}
function* invoke(remote, handlerProp, ctx, hargs, what) {
  const caller = CO.current;
  let res = null, waiting = false;
  const sendBack = (r) => {
    later(() => {
      res = r;
      if (waiting) ENV.rt.defer(caller, [r]);
    }, caller.ctx);
  };
  later(() => {
    const h = remote.props[handlerProp];
    if (!h) return sendBack([false, `${what}: ${handlerProp} callback not set (the remote ${remote.fullName()} has no handler)`]);
    runHandler(h, hargs, ctx, sendBack);
  }, ctx);
  if (res === null) {
    waiting = true;
    const r = yield SCHED;
    res = r instanceof Array && r.length === 1 && r[0] instanceof Array ? r[0] : r;
  }
  if (!res[0]) throw new C.LuaError(res[1]);
  return copyArgs(res.slice(1)).length <= 1 ? copyArgs(res.slice(1))[0] : copyArgs(res.slice(1));
}
net.invokeServer = function* (remote, args) {
  needCtx('client', 'InvokeServer');
  net.stats.invokeServer++;
  const player = ENV.localPlayer;
  return yield* invoke(remote, 'OnServerInvoke', ENV.contexts.server, [player, ...copyArgs(args)], 'InvokeServer');
};
net.invokeClient = function* (remote, player, args) {
  needCtx('server', 'InvokeClient');
  net.stats.invokeClient++;
  return yield* invoke(remote, 'OnClientInvoke', ENV.contexts.client, copyArgs(args), 'InvokeClient');
};
module.exports = net;
