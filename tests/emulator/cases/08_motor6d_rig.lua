-- simulate: 6
local function check(name, cond, msg) print((cond and "OK " or "FAIL ") .. name .. (cond and "" or (": " .. tostring(msg)))) end
local floor = Instance.new("Part"); floor.Size = Vector3.new(100, 2, 100); floor.Position = Vector3.new(0, -1, 0); floor.Anchored = true; floor.Parent = workspace
task.wait(1.5)
local pl = game.Players:GetPlayers()[1] or game.Players.PlayerAdded:Wait()
task.wait(1)
local ch = pl.Character
local torso = ch:FindFirstChild("Torso")
local rs = torso and torso:FindFirstChild("Right Shoulder")
check("R6 Motor6D Right Shoulder", rs ~= nil and rs:IsA("Motor6D") and rs.Part1 == ch["Right Arm"])
check("RootJoint in HRP", ch.HumanoidRootPart:FindFirstChild("RootJoint") ~= nil)
check("standard C0", rs and (rs.C0.Position - Vector3.new(1, 0.5, 0)).Magnitude < 1e-3, rs and rs.C0)
task.wait(0.3)
local rel = ch.HumanoidRootPart.CFrame:ToObjectSpace(ch["Right Arm"].CFrame)
check("arm rest pose", (rel.Position - Vector3.new(1.5, 0, 0)).Magnitude < 0.3, rel.Position)
-- raise the arm forward 90° via C0 (torso-space rotation about X at the shoulder) — like a real R6 swing script
local base = rs.C0
rs.C0 = CFrame.new(base.Position) * CFrame.Angles(math.rad(90), 0, 0) * base.Rotation
task.wait(0.2)
rel = ch.HumanoidRootPart.CFrame:ToObjectSpace(ch["Right Arm"].CFrame)
check("C0 raises arm forward", rel.Position.Z < -0.3 and rel.Position.Y > 0.3 and rel.UpVector.Z > 0.9, tostring(rel.Position) .. " up " .. tostring(rel.UpVector))
local t = game:GetService("TweenService"):Create(rs, TweenInfo.new(0.2), { C0 = base })
t:Play(); task.wait(0.5)
rel = ch.HumanoidRootPart.CFrame:ToObjectSpace(ch["Right Arm"].CFrame)
check("tween C0 back", (rel.Position - Vector3.new(1.5, 0, 0)).Magnitude < 0.3, rel.Position)
print("DONE")
