-- simulate: 9
-- input: 4=down,4.2=up,4.6=gdown,4.8=gup,5.2=tdown,5.4=tup
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local floor = Instance.new("Part"); floor.Size = Vector3.new(100, 2, 100); floor.Position = Vector3.new(0, -1, 0); floor.Anchored = true; floor.Parent = workspace
task.wait(1)
local pl = game.Players:GetPlayers()[1] or game.Players.PlayerAdded:Wait()
local ch = pl.Character or pl.CharacterAdded:Wait()
task.wait(0.5)
local bp = pl:WaitForChild("Backpack")
local function mkTool(name)
	local t = Instance.new("Tool"); t.Name = name; t.Grip = CFrame.new(0, -1, 0)
	local h = Instance.new("Part"); h.Name = "Handle"; h.Size = Vector3.new(0.4, 2, 0.4); h.CanCollide = false; h.Parent = t
	local tip = Instance.new("Part"); tip.Name = "Tip"; tip.Size = Vector3.new(0.6, 0.6, 0.6); tip.CanCollide = false
	tip.CFrame = h.CFrame * CFrame.new(0, 1.3, 0); tip.Parent = t
	local w = Instance.new("WeldConstraint"); w.Part0 = h; w.Part1 = tip; w.Parent = h
	t.Parent = bp
	return t
end
local sword, other = mkTool("Sword"), mkTool("Other")
local log = {}
sword.Equipped:Connect(function(m) table.insert(log, "eq") end)
sword.Unequipped:Connect(function() table.insert(log, "uneq") end)
sword.Activated:Connect(function() table.insert(log, "act") end)
sword.Deactivated:Connect(function() table.insert(log, "deact") end)
local hum = ch:FindFirstChildOfClass("Humanoid")
hum:EquipTool(sword)
task.wait(0.3)
check("equip parent", sword.Parent == ch)
check("Equipped fired", log[1] == "eq", table.concat(log, ","))
local grip = ch["Right Arm"]:FindFirstChild("RightGrip")
check("RightGrip weld", grip ~= nil and grip:IsA("Weld") and grip.Part1 == sword.Handle)
local arm = ch["Right Arm"]
local want = arm.CFrame * CFrame.new(0, -1, 0) * CFrame.Angles(-math.pi / 2, 0, 0) * sword.Grip:Inverse()
check("handle in hand", (sword.Handle.Position - want.Position).Magnitude < 0.05, (sword.Handle.Position - want.Position).Magnitude)
check("handle near arm", (sword.Handle.Position - arm.Position).Magnitude < 3, (sword.Handle.Position - arm.Position).Magnitude)
local rel = sword.Handle.CFrame:ToObjectSpace(sword.Tip.CFrame)
check("welded part follows", (rel.Position - Vector3.new(0, 1.3, 0)).Magnitude < 0.05, rel.Position)
check("tool not falling", sword.Handle.Position.Y > 1, sword.Handle.Position.Y)
-- one tool at a time
hum:EquipTool(other)
task.wait(0.2)
check("swap: other in hand", other.Parent == ch and sword.Parent == bp, tostring(sword.Parent))
check("Unequipped fired", log[#log] == "uneq", table.concat(log, ","))
check("old grip removed", #(function() local n = {} for _, c in arm:GetChildren() do if c.Name == "RightGrip" then table.insert(n, c) end end return n end)() == 1)
hum:UnequipTools()
task.wait(0.1)
check("UnequipTools", other.Parent == bp and ch:FindFirstChildOfClass("Tool") == nil)
hum:EquipTool(sword)
-- world input at t=4 (click), 4.6 (over GUI: ignored), 5.2 (tap)
task.wait(9 - 2.6 - 1.5)
local s = table.concat(log, ",")
check("world click/tap -> Activated/Deactivated", s == "eq,uneq,eq,act,deact,act,deact", s)
sword:Activate()
check("Tool:Activate()", log[#log] == "act")
print("DONE")
