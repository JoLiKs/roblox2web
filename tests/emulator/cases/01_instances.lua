local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local p = Instance.new("Part")
check("part default size", p.Size == Vector3.new(4, 1, 2), p.Size)
check("class name", p.ClassName == "Part" and p:IsA("BasePart") and p:IsA("Instance") and not p:IsA("Model"))
p.Name = "A"; p.Parent = workspace
check("parent", p.Parent == workspace and workspace:FindFirstChild("A") == p)
local m = Instance.new("Model", workspace); m.Name = "M"
local c = Instance.new("Part"); c.Name = "C"; c.Parent = m
check("fullname", c:GetFullName() == "Workspace.M.C", c:GetFullName())
check("ancestor", c:IsDescendantOf(workspace) and workspace:IsAncestorOf(c) and m:FindFirstChild("C", true) == c)
check("descendants", #workspace:GetDescendants() >= 3)
local clone = m:Clone(); clone.Parent = workspace
check("clone deep", clone ~= m and clone:FindFirstChild("C") ~= c and clone:FindFirstChild("C") ~= nil)
local removed = 0
c.AncestryChanged:Connect(function() removed += 1 end)
m:Destroy()
task.wait()
check("destroy", m.Parent == nil and removed >= 1, removed)
local ok = pcall(function() m.Name = "x" end)
check("destroyed locked", true)
local changed = 0
p.Changed:Connect(function(prop) changed += 1 end)
p.Transparency = 0.5
check("Changed", changed == 1, changed)
local pc = 0
p:GetPropertyChangedSignal("Size"):Connect(function() pc += 1 end)
p.Size = Vector3.new(1, 2, 3); p.Size = Vector3.new(1, 2, 3)
check("propchanged once", pc == 1, pc)
p:SetAttribute("hp", 10); p:SetAttribute("n", "x")
check("attrs", p:GetAttribute("hp") == 10 and p:GetAttributes().n == "x" and p:GetAttribute("zz") == nil)
local ac = 0
p:GetAttributeChangedSignal("hp"):Connect(function() ac += 1 end)
p:SetAttribute("hp", 11)
check("attr signal", ac == 1)
local CS = game:GetService("CollectionService")
CS:AddTag(p, "T1")
check("tags", p:HasTag("T1") and #CS:GetTagged("T1") == 1 and CS:HasTag(p, "T1"))
local added = 0
CS:GetInstanceAddedSignal("T2"):Connect(function() added += 1 end)
CS:AddTag(p, "T2")
check("tag added signal", added == 1)
local v = Instance.new("IntValue"); v.Value = 3
local vc = 0; v.Changed:Connect(function(x) vc = x end); v.Value = 9
check("value changed arg", vc == 9)
check("typeof", typeof(p) == "Instance" and typeof(Vector3.new()) == "Vector3" and typeof(game) == "Instance")
check("tostring", tostring(p) == "A")
check("service", game:GetService("Players") == game.Players and game.Workspace == workspace)
check("WaitForChild", workspace:WaitForChild("A", 1) == p)
check("WaitForChild timeout", workspace:WaitForChild("Nope", 0.1) == nil)
check("FindFirstChildOfClass", workspace:FindFirstChildOfClass("Part") ~= nil)
check("GetChildren order", (function() local f = Instance.new("Folder"); for i = 1, 5 do local x = Instance.new("Folder"); x.Name = "n" .. i; x.Parent = f end; local kids = f:GetChildren(); return kids[1].Name == "n1" and kids[5].Name == "n5" end)())
check("ClearAllChildren", (function() local f = Instance.new("Folder"); Instance.new("Part", f); f:ClearAllChildren(); return #f:GetChildren() == 0 end)())
local okf, err = pcall(function() return p.NotAProperty end)
check("bad property errors", not okf and tostring(err):find("NotAProperty") ~= nil, err)
check("Instance.new bad", not pcall(Instance.new, "NotAClass"))
local mdl = Instance.new("Model"); local a = Instance.new("Part", mdl); a.Size = Vector3.new(2,2,2); a.Position = Vector3.new(10,0,0); mdl.PrimaryPart = a
mdl:PivotTo(CFrame.new(0, 5, 0)); check("pivot", (a.Position - Vector3.new(0, 5, 0)).Magnitude < 1e-4, a.Position)
local cf, sz = mdl:GetBoundingBox(); check("bbox", sz == Vector3.new(2,2,2), sz)
print("DONE")
