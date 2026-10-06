-- simulate: 16
-- attrs: Fast=3,Mode=bot
-- Model:ScaleTo / GetScale (персонаж и NPC), NPC-риг R6 из скрипта ходит через Humanoid:MoveTo.
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local floor = Instance.new("Part"); floor.Size = Vector3.new(200, 2, 200); floor.Position = Vector3.new(0, -1, 0); floor.Anchored = true; floor.Parent = workspace
task.wait(1.5)
local pl = game.Players:GetPlayers()[1] or game.Players.PlayerAdded:Wait()
task.wait(1)
local ch = pl.Character
check("GetScale default 1", ch:GetScale() == 1, ch:GetScale())
local torso0 = ch.Torso.Size
local c0 = ch.Torso["Right Shoulder"].C0.Position
ch:ScaleTo(1.6)
check("GetScale after ScaleTo", math.abs(ch:GetScale() - 1.6) < 1e-6, ch:GetScale())
check("part sizes scaled", (ch.Torso.Size - torso0 * 1.6).Magnitude < 1e-3, ch.Torso.Size)
check("Motor6D C0 scaled", (ch.Torso["Right Shoulder"].C0.Position - c0 * 1.6).Magnitude < 1e-3, ch.Torso["Right Shoulder"].C0)
task.wait(1)
local feet = ch.HumanoidRootPart.Position.Y - ch.HumanoidRootPart.Size.Y / 2 - ch["Left Leg"].Size.Y
check("scaled character stands on the floor", math.abs(feet) < 0.6, feet)
local rel = ch.HumanoidRootPart.CFrame:ToObjectSpace(ch["Right Arm"].CFrame)
check("scaled arm offset", math.abs(rel.Position.X - 1.5 * 1.6) < 0.3, rel.Position)
ch:ScaleTo(1)
check("scale back", ch:GetScale() == 1 and (ch.Torso.Size - torso0).Magnitude < 1e-3, ch.Torso.Size)
local ok = pcall(function() ch:ScaleTo(0) end)
check("ScaleTo(0) errors", not ok)

-- NPC: стандартный R6-риг, собранный скриптом (как боты игры)
local m = Instance.new("Model"); m.Name = "Npc"
local function part(name, size)
	local p = Instance.new("Part"); p.Name = name; p.Size = size; p.CanCollide = name ~= "HumanoidRootPart"; p.Parent = m; return p
end
local hrp = part("HumanoidRootPart", Vector3.new(2, 2, 1)); hrp.Transparency = 1
local t = part("Torso", Vector3.new(2, 2, 1)); local h = part("Head", Vector3.new(2, 1, 1))
local la, ra = part("Left Arm", Vector3.new(1, 2, 1)), part("Right Arm", Vector3.new(1, 2, 1))
local ll, rl = part("Left Leg", Vector3.new(1, 2, 1)), part("Right Leg", Vector3.new(1, 2, 1))
local function motor(name, parent, p0, p1, c0, c1)
	local j = Instance.new("Motor6D"); j.Name = name; j.Part0 = p0; j.Part1 = p1; j.C0 = c0; j.C1 = c1; j.Parent = parent
end
local NK = CFrame.new(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)
local RS = CFrame.new(0, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0)
local LS = CFrame.new(0, 0, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0)
motor("RootJoint", hrp, hrp, t, NK, NK)
motor("Right Shoulder", t, t, ra, CFrame.new(1, 0.5, 0) * RS, CFrame.new(-0.5, 0.5, 0) * RS)
motor("Left Shoulder", t, t, la, CFrame.new(-1, 0.5, 0) * LS, CFrame.new(0.5, 0.5, 0) * LS)
motor("Right Hip", t, t, rl, CFrame.new(1, -1, 0) * RS, CFrame.new(0.5, 1, 0) * RS)
motor("Left Hip", t, t, ll, CFrame.new(-1, -1, 0) * LS, CFrame.new(-0.5, 1, 0) * LS)
motor("Neck", t, t, h, CFrame.new(0, 1, 0) * NK, CFrame.new(0, -0.5, 0) * NK)
local hum = Instance.new("Humanoid"); hum.WalkSpeed = 16; hum.HipHeight = 0; hum.Parent = m
m.PrimaryPart = hrp
m:PivotTo(CFrame.new(45, 3, 0))
m.Parent = workspace
task.wait(0.5)
hum:MoveTo(Vector3.new(45, 0, -30))
task.wait(3)
check("NPC walks with Humanoid:MoveTo", (hrp.Position - Vector3.new(45, hrp.Position.Y, -30)).Magnitude < 3, hrp.Position)
check("NPC limbs follow the rig", (ra.Position - hrp.Position).Magnitude < 3, ra.Position)
m:ScaleTo(1.5)
task.wait(0.5)
check("NPC scaled", math.abs(t.Size.Y - 3) < 1e-3 and math.abs(m:GetScale() - 1.5) < 1e-6, t.Size)
check("workspace attrs from URL", workspace:GetAttribute("Fast") == 3 and workspace:GetAttribute("Mode") == "bot", workspace:GetAttribute("Fast"))
print("DONE")
