-- simulate: 4
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local TS = game:GetService("TweenService")
local p = Instance.new("Part"); p.Anchored = true; p.Parent = workspace
local tw = TS:Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear), { Position = Vector3.new(10, 0, 0), Transparency = 1 })
local completed
tw.Completed:Connect(function(state) completed = state end)
tw:Play()
task.wait(0.5)
check("tween mid", p.Position.X > 3 and p.Position.X < 7, p.Position.X)
task.wait(0.7)
check("tween end", p.Position.X == 10 and p.Transparency == 1 and completed == Enum.PlaybackState.Completed, tostring(completed))
local p2 = Instance.new("Part"); p2.Parent = workspace
local tw2 = TS:Create(p2, TweenInfo.new(5), { Size = Vector3.new(9, 9, 9) }); tw2:Play(); task.wait(0.1); tw2:Cancel()
check("tween cancel", p2.Size.X < 9)
-- Debris
local d = Instance.new("Part"); d.Parent = workspace; game:GetService("Debris"):AddItem(d, 0.2); task.wait(0.4)
check("debris", d.Parent == nil)
-- DataStore
local DS = game:GetService("DataStoreService"):GetDataStore("t")
DS:SetAsync("k", { a = 1, b = { 2, 3 } })
local v = DS:GetAsync("k")
check("datastore roundtrip", v.a == 1 and v.b[2] == 3)
check("datastore update", DS:UpdateAsync("k", function(old) old.a += 1; return old end).a == 2)
check("datastore increment", DS:IncrementAsync("n", 5) == 5 and DS:IncrementAsync("n", 2) == 7)
check("datastore remove", (DS:RemoveAsync("k")).a == 2 and DS:GetAsync("k") == nil)
check("datastore isolated copy", (function() local t = {x=1}; DS:SetAsync("c", t); t.x = 2; return DS:GetAsync("c").x == 1 end)())
-- HttpService
local H = game:GetService("HttpService")
local js = H:JSONEncode({ a = 1, b = { true, "x" } })
local dec = H:JSONDecode(js)
check("json", dec.a == 1 and dec.b[1] == true and dec.b[2] == "x", js)
check("guid", #H:GenerateGUID(false) > 20)
check("urlencode", H:UrlEncode("a b&c") == "a%20b%26c", H:UrlEncode("a b&c"))
-- Marketplace owned/receipt
local MS = game:GetService("MarketplaceService")
check("marketplace info", pcall(function() return MS:GetProductInfo(1234, Enum.InfoType.Product) end))
-- Players
local Players = game:GetService("Players")
check("players local", Players.LocalPlayer == nil, "server has no LocalPlayer")
check("players count", #Players:GetPlayers() == 1 and Players:GetPlayers()[1].Name == "Player1")
local pl = Players:GetPlayers()[1]
check("character", pl.Character ~= nil and pl.Character:FindFirstChild("Humanoid") ~= nil)
check("getplayerfromcharacter", Players:GetPlayerFromCharacter(pl.Character) == pl)
check("userid", Players:GetPlayerByUserId(pl.UserId) == pl)
check("workspace raycast", (function() local g = Instance.new("Part"); g.Anchored = true; g.Size = Vector3.new(50,1,50); g.Position = Vector3.new(500, 0, 500); g.Parent = workspace; local r = workspace:Raycast(Vector3.new(500, 10, 500), Vector3.new(0, -20, 0)); return r and r.Instance == g and math.abs(r.Position.Y - 0.5) < 1e-6 and r.Normal == Vector3.new(0,1,0) end)())
check("lighting", game:GetService("Lighting").ClockTime ~= nil)
check("policy", pcall(function() return game:GetService("PolicyService"):GetPolicyInfoForPlayerAsync(pl) end))
-- ModuleScript require
check("require shared", require(game.ReplicatedStorage.Shared).answer == 42)
-- pcall non-existent member message
local ok, e = pcall(function() return game:GetService("NoSuchService") end)
check("bad service", not ok)
print("DONE")
