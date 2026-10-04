local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local be = Instance.new("BindableEvent")
local got = {}
local c1 = be.Event:Connect(function(...) table.insert(got, select("#", ...)) end)
be:Fire(1, nil, 3)
check("bindable fire", got[1] == 3, got[1])
c1:Disconnect(); be:Fire(1)
check("disconnect", #got == 1 and not c1.Connected)
local onceN = 0
be.Event:Once(function() onceN += 1 end)
be:Fire(); be:Fire()
check("once", onceN == 1)
task.spawn(function() local a, b = be.Event:Wait(); got.waited = a .. b end)
task.wait()
be:Fire("x", "y")
task.wait()
check("wait", got.waited == "xy", got.waited)
-- task scheduling
local order = {}
task.defer(function() table.insert(order, "defer") end)
task.spawn(function() table.insert(order, "spawn") end)
task.delay(0.1, function() table.insert(order, "delay") end)
table.insert(order, "main")
task.wait(0.2)
check("order", table.concat(order, ",") == "spawn,main,defer,delay", table.concat(order, ","))
local t0 = os.clock(); local dt = task.wait(0.5)
check("task.wait time", dt >= 0.499 and dt < 0.7, dt)
local th = task.delay(5, function() order.bad = true end)
task.cancel(th); task.wait(0.1)
check("task.cancel", not order.bad)
local co = coroutine.create(function(a) local b = coroutine.yield(a + 1); return b * 2 end)
local _, r1 = coroutine.resume(co, 1); local _, r2 = coroutine.resume(co, 10)
check("coroutine", r1 == 2 and r2 == 20 and coroutine.status(co) == "dead")
local w = coroutine.wrap(function() for i = 1, 3 do coroutine.yield(i) end end)
check("wrap", w() == 1 and w() == 2 and w() == 3)
-- yield across pcall
local okp, v = pcall(function() task.wait(0.05); return "after" end)
check("yield in pcall", okp and v == "after")
-- error in thread does not kill others
task.spawn(function() error("EXPECTED-boom") end)
task.wait()
check("error isolation", true)
-- RunService heartbeat
local RS = game:GetService("RunService")
local beats = 0; local hb = RS.Heartbeat:Connect(function(dt) beats += 1 end)
task.wait(0.5); hb:Disconnect()
check("heartbeat fires", beats >= 5, beats)
check("RunService flags", RS:IsServer() and not RS:IsClient() and RS:IsRunning())
-- signal with yielding handler
local order2 = {}
be.Event:Connect(function() task.wait(0.05); table.insert(order2, "slow") end)
be:Fire(); table.insert(order2, "fast")
task.wait(0.1)
check("handler yields", order2[1] == "fast" and order2[2] == "slow")
-- spawn passes args
local gotargs; task.spawn(function(...) gotargs = {...} end, 1, 2, 3)
check("spawn args", #gotargs == 3)
-- tick/time/os.time
check("time", type(tick()) == "number" and type(time()) == "number" and os.time() > 1.7e9)
print("DONE")
